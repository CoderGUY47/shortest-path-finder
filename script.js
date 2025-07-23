const mapStyles = [
    { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64779e" }] },
    { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
    { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
    { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3C7680" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
    { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#b0d5ce" }] },
    { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#023e58" }] },
    { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
    { featureType: "transit", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
    { featureType: "transit.line", elementType: "geometry.fill", stylers: [{ color: "#283d6a" }] },
    { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#3a4762" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

let map;
let nodes = [];
let edges = [];
let startNode = null;
let endNode = null;
let isAddingNodes = true;
let nodeIdCounter = 0;
let lastNode = null;
let polylines = [];
let markers = [];
let history = [];
let historyPointer = -1;

function saveState() {
    // Clear redo history
    history = history.slice(0, historyPointer + 1);

    const state = {
        nodes: nodes.map(node => ({
            id: node.id,
            position: { lat: node.position.lat(), lng: node.position.lng() },
            iconType: node.marker.getIcon().url.includes("start") ? "start" :
                      node.marker.getIcon().url.includes("end") ? "end" :
                      node.marker.getIcon().url.includes("visited") ? "visited" :
                      node.marker.getIcon().url.includes("path") ? "path" :
                      "normal"
        })),
        edges: edges.map(edge => ({ ...edge })),
        startNode: startNode,
        endNode: endNode,
        lastNode: lastNode,
        nodeIdCounter: nodeIdCounter,
    };
    history.push(state);
    historyPointer++;
}

function loadState(state) {
    // Clear existing map elements
    nodes.forEach(node => {
        node.marker.setMap(null);
        if (node.deleteButton) node.deleteButton.setMap(null);
    });
    polylines.forEach(p => p.setMap(null));

    nodes = [];
    edges = [];
    polylines = [];
    markers = [];

    startNode = state.startNode;
    endNode = state.endNode;
    lastNode = state.lastNode;
    nodeIdCounter = state.nodeIdCounter;

    // Recreate nodes and their markers/delete buttons
    state.nodes.forEach(nodeData => {
        const position = new google.maps.LatLng(nodeData.position.lat, nodeData.position.lng);
        const marker = new google.maps.Marker({
            position,
            map,
            label: nodeData.id,
            icon: getNodeIcon(nodeData.id, nodeData.iconType),
            draggable: true
        });

        const deleteButton = new DeleteButtonOverlay(position, nodeData.id, deleteNode);
        deleteButton.setMap(map);

        marker.addListener("click", () => {
            handleNodeClick(nodeData.id);
        });

        marker.addListener("rightclick", () => {
            deleteNode(nodeData.id);
        });

        marker.addListener("dragend", (e) => {
            const node = nodes.find(n => n.id === nodeData.id);
            if (node && e.latLng) {
                node.position = e.latLng;
                node.deleteButton.setPosition(e.latLng);
                redrawEdges();
                saveState(); // Save state after drag
            }
        });
        nodes.push({ id: nodeData.id, position: position, marker, deleteButton });
        markers.push(marker);
    });

    // Recreate edges
    edges = state.edges;
    redrawEdges();

    // Update UI elements
    document.getElementById("start-node").textContent = startNode || "None";
    document.getElementById("end-node").textContent = endNode || "None";
    document.getElementById("total-distance").textContent = "0"; // Reset distance on undo
}

function undo() {
    if (historyPointer > 0) {
        historyPointer--;
        loadState(history[historyPointer]);
    }
}

function redo() {
    if (historyPointer < history.length - 1) {
        historyPointer++;
        loadState(history[historyPointer]);
    }
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 40.715, lng: -74.005 },
        zoom: 14,
        styles: mapStyles,
        disableDefaultUI: true,
        gestureHandling: "greedy",
    });

    map.addListener("click", (e) => {
        if (isAddingNodes) {
            addNode(e.latLng);
            saveState(); // Save state after adding a node
        }
    });
}

function addNode(position) {
    const nodeId = `N${nodeIdCounter++}`;
    const marker = new google.maps.Marker({
        position,
        map,
        label: nodeId,
        icon: getNodeIcon(nodeId),
        draggable: true // Make marker draggable
    });

    const deleteButton = new DeleteButtonOverlay(position, nodeId, deleteNode);
    deleteButton.setMap(map);

    marker.addListener("click", () => {
        handleNodeClick(nodeId);
    });

    marker.addListener("rightclick", () => {
        deleteNode(nodeId);
    });

    marker.addListener("dragend", (e) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && e.latLng) {
            node.position = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            node.deleteButton.setPosition(e.latLng); // Update delete button position
            redrawEdges();
        }
    });

    nodes.push({ id: nodeId, position, marker, deleteButton });
    markers.push(marker);
}

function handleNodeClick(nodeId) {
    if (isAddingNodes) return;

    const clickedNode = nodes.find(n => n.id === nodeId);
    if (!clickedNode) return;

    if (!startNode) {
        startNode = nodeId;
        clickedNode.marker.setIcon(getNodeIcon(nodeId, "start"));
        document.getElementById("start-node").textContent = startNode;
        lastNode = nodeId;
        saveState(); // Save state after setting start node
    } else if (!endNode && nodeId !== startNode) {
        endNode = nodeId;
        clickedNode.marker.setIcon(getNodeIcon(nodeId, "end"));
        document.getElementById("end-node").textContent = endNode;
        lastNode = nodeId;
        saveState(); // Save state after setting end node
    } else if (lastNode && lastNode !== nodeId) {
        const fromNode = nodes.find(n => n.id === lastNode);
        const toNode = nodes.find(n => n.id === nodeId);
        if (fromNode && toNode) {
            const weight = Math.round(google.maps.geometry.spherical.computeDistanceBetween(
                fromNode.position,
                toNode.position
            ) / 1000);
            edges.push({ from: lastNode, to: nodeId, weight });
            drawEdge(fromNode, toNode, weight);
            saveState(); // Save state after adding an edge
        }
        lastNode = nodeId;
    }
}

function deleteNode(nodeId) {
    const nodeToDelete = nodes.find(n => n.id === nodeId);
    if (nodeToDelete) {
        nodeToDelete.marker.setMap(null);
        if (nodeToDelete.deleteButton) {
            nodeToDelete.deleteButton.setMap(null);
        }
    }

    nodes = nodes.filter(n => n.id !== nodeId);
    edges = edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    if (startNode === nodeId) {
        startNode = null;
        document.getElementById("start-node").textContent = "None";
    }
    if (endNode === nodeId) {
        endNode = null;
        document.getElementById("end-node").textContent = "None";
    }
    if (lastNode === nodeId) {
        lastNode = null;
    }
    redrawEdges();
    saveState(); // Save state after deletion
}

function drawEdge(fromNode, toNode, weight) {
    const polyline = new google.maps.Polyline({
        path: [fromNode.position, toNode.position],
        geodesic: true,
        strokeColor: "#00ffff",
        strokeOpacity: 0.7,
        strokeWeight: 2,
    });
    polyline.setMap(map);
    polylines.push(polyline);
}

function redrawEdges() {
    polylines.forEach(p => p.setMap(null));
    polylines = [];
    edges.forEach(edge => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (fromNode && toNode) {
            drawEdge(fromNode, toNode, edge.weight);
        }
    });
}

function getNodeIcon(label, type = "normal") {
    const color =
        type === "start" ? "#00ff00" :
        type === "end" ? "#ff00ff" :
        type === "path" ? "#ff8c00" :
        type === "visited" ? "#ffff00" :
        "#ffffff";

    return {
        url: `data:image/svg+xml;utf-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="${color}" fill-opacity="0.7"/>
            <text x="20" y="25" text-anchor="middle" font-size="16" font-family="Arial" font-weight="bold" fill="#fff" stroke="none">${label}</text>
          </svg>
        `)}`,
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 20),
    };
}

document.getElementById("add-nodes-btn").addEventListener("click", () => {
    isAddingNodes = true;
});

document.getElementById("connect-nodes-btn").addEventListener("click", () => {
    isAddingNodes = false;
});

document.getElementById("run-btn").addEventListener("click", runVisualization);

document.getElementById("clear-btn").addEventListener("click", handleClear);
document.getElementById("undo-btn").addEventListener("click", undo);
document.getElementById("redo-btn").addEventListener("click", redo);

function runVisualization() {
    if (!startNode || !endNode) return;

    const graph = {};
    nodes.forEach(node => graph[node.id] = []);
    edges.forEach(edge => {
        graph[edge.from].push({ to: edge.to, weight: edge.weight });
        graph[edge.to].push({ to: edge.from, weight: edge.weight });
    });

    const { path, visited, distance } = dijkstra(graph, startNode, endNode, true);

    let i = 0;
    const interval = setInterval(() => {
        if (i < visited.length) {
            const node = nodes.find(n => n.id === visited[i]);
            if (node) {
                node.marker.setIcon(getNodeIcon(node.id, "visited"));
            }
            i++;
        } else {
            clearInterval(interval);
            drawPath(path);
            document.getElementById("total-distance").textContent = distance === Infinity ? "No path" : distance.toFixed(2);
        }
    }, 100);
}

function drawPath(path) {
    for (let i = 0; i < path.length - 1; i++) {
        const fromNode = nodes.find(n => n.id === path[i]);
        const toNode = nodes.find(n => n.id === path[i + 1]);
        if (fromNode && toNode) {
            const polyline = new google.maps.Polyline({
                path: [fromNode.position, toNode.position],
                geodesic: true,
                strokeColor: "#ff8c00",
                strokeOpacity: 1,
                strokeWeight: 4,
            });
            polyline.setMap(map);
            polylines.push(polyline);
        }
    }
}

function handleClear() {
    location.reload();
}

class PriorityQueue {
    constructor() {
        this.nodes = [];
    }

    enqueue(priority, key) {
        this.nodes.push({ key, priority });
        this.nodes.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.nodes.shift().key;
    }

    empty() {
        return !this.nodes.length;
    }
}

class DeleteButtonOverlay extends google.maps.OverlayView {
    constructor(position, nodeId, deleteCallback) {
        super();
        this.position = position;
        this.nodeId = nodeId;
        this.deleteCallback = deleteCallback;
        this.div = null;
    }

    onAdd() {
        this.div = document.createElement('div');
        this.div.style.position = 'absolute';
        this.div.style.cursor = 'pointer';
        this.div.style.zIndex = '100'; // Ensure it's above markers

        // Add styling for the delete button
        this.div.innerHTML = `
            <button class="delete-node-btn">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        this.div.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent map click
            e.preventDefault(); // Prevent any default browser action
            this.deleteCallback(this.nodeId);
        });

        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(this.div);
    }

    draw() {
        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(this.position);
        if (this.div) {
            this.div.style.left = (point.x - 15) + 'px'; // Adjust position
            this.div.style.top = (point.y - 40) + 'px'; // Adjust position
        }
    }

    onRemove() {
        if (this.div) {
            this.div.parentNode.removeChild(this.div);
            this.div = null;
        }
    }

    setPosition(newPosition) {
        this.position = newPosition;
        this.draw(); // Redraw the overlay with the new position
    }
}

function dijkstra(graph, start, end, returnVisited = false) {
    const distances = {};
    const previous = {};
    const queue = new PriorityQueue();
    const visited = [];

    for (const node in graph) {
        if (node === start) {
            distances[node] = 0;
            queue.enqueue(0, node);
        } else {
            distances[node] = Infinity;
            queue.enqueue(Infinity, node);
        }
        previous[node] = null;
    }

    while (!queue.empty()) {
        const smallest = queue.dequeue();
        if (!smallest) break;

        if (returnVisited) {
            visited.push(smallest);
        }

        if (smallest === end) {
            const path = [];
            let curr = end;
            while (curr) {
                path.unshift(curr);
                curr = previous[curr];
            }
            if (path[0] !== start) return { path: [], visited, distance: Infinity };
            return { path, visited, distance: distances[end] };
        }

        if (distances[smallest] === Infinity) continue;

        for (const edge of graph[smallest]) {
            const alt = distances[smallest] + edge.weight;
            if (alt < distances[edge.to]) {
                distances[edge.to] = alt;
                previous[edge.to] = smallest;
                queue.enqueue(alt, edge.to);
            }
        }
    }

    return { path: [], visited, distance: Infinity };
}

window.onload = initMap;
