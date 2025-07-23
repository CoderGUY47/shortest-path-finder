'use client'
import { useState, useCallback, useRef } from "react";
import { GoogleMap, Marker, Polyline, useLoadScript, OverlayView } from "@react-google-maps/api";
import { FaPlay, FaTrash, FaPlus } from "react-icons/fa";
import { dijkstra, Graph, NodeId } from "./utils/dijkstra";
import React from "react";

// New futuristic map style
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

const containerStyle = {
  width: "100vw",
  height: "100vh",
};

const center = {
  lat: 40.715,
  lng: -74.005,
};

type Node = {
  id: NodeId;
  position: { lat: number; lng: number };
};

type Edge = {
  from: NodeId;
  to: NodeId;
  weight: number;
};

const getNodeMarker = (label: string, type: "normal" | "start" | "end" | "visited" | "path" = "normal") => {
  const color =
    type === "start" ? "#00ff00" :
    type === "end" ? "#ff00ff" :
    type === "path" ? "#ff8c00" :
    type === "visited" ? "#ffff00" :
    "#ffffff";

  return {
    url: `data:image/svg+xml;utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="${color}" fill-opacity="0.7" stroke="#fff" stroke-width="2"/>
        <text x="20" y="25" text-anchor="middle" font-size="16" font-family="Arial" font-weight="bold" fill="#fff">${label}</text>
      </svg>
    `)}`,
    scaledSize: { width: 40, height: 40 } as google.maps.Size,
    anchor: { x: 20, y: 20 } as google.maps.Point,
  };
};

export default function Page() {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["geometry"],
  });

  const [mapKey, setMapKey] = useState(0);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [startNode, setStartNode] = useState<NodeId | null>(null);
  const [endNode, setEndNode] = useState<NodeId | null>(null);
  const [path, setPath] = useState<NodeId[]>([]);
  const [visitedNodes, setVisitedNodes] = useState<NodeId[]>([]);
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [lastNode, setLastNode] = useState<NodeId | null>(null);
  const [isAddingNodes, setIsAddingNodes] = useState(true);
  const nodeIdCounter = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (isAddingNodes && e.latLng) {
      const newNodeId = `N${nodeIdCounter.current++}`;
      const newNode: Node = {
        id: newNodeId,
        position: { lat: e.latLng.lat(), lng: e.latLng.lng() },
      };
      setNodes((prev) => [...prev, newNode]);
    }
  }, [isAddingNodes]);

  const handleNodeClick = (nodeId: NodeId) => {
    if (isAddingNodes || isVisualizing) return;

    if (!startNode) {
      setStartNode(nodeId);
      setLastNode(nodeId);
    } else if (!endNode && nodeId !== startNode) {
      setEndNode(nodeId);
      setLastNode(nodeId);
    } else if (startNode && endNode && lastNode && lastNode !== nodeId) {
      const fromNode = nodes.find(n => n.id === lastNode);
      const toNode = nodes.find(n => n.id === nodeId);
      if (fromNode && toNode) {
        const weight = Math.round(google.maps.geometry.spherical.computeDistanceBetween(
          new google.maps.LatLng(fromNode.position),
          new google.maps.LatLng(toNode.position)
        ) / 1000);
        setEdges((prev) => [...prev, { from: lastNode, to: nodeId, weight }]);
      }
      setLastNode(nodeId);
    }
  };

  const deleteNode = (nodeId: NodeId) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    if (startNode === nodeId) setStartNode(null);
    if (endNode === nodeId) setEndNode(null);
    if (lastNode === nodeId) setLastNode(null);
  };

  const handleMarkerRightClick = (e: google.maps.MapMouseEvent, nodeId: NodeId) => {
    e.domEvent.stopPropagation();
    deleteNode(nodeId);
  };

  const handleDeleteButtonClick = (e: React.MouseEvent, nodeId: NodeId) => {
    console.log('Delete button clicked for node:', nodeId);
    e.stopPropagation();
    e.preventDefault(); // Prevent any default behavior
    deleteNode(nodeId);
  };

  const runVisualization = () => {
    if (!startNode || !endNode) return;

    const newGraph: Graph = {};
    nodes.forEach(node => newGraph[node.id] = []);
    edges.forEach(edge => {
      newGraph[edge.from].push({ to: edge.to, weight: edge.weight });
      newGraph[edge.to].push({ to: edge.from, weight: edge.weight });
    });

    const { path, visited } = dijkstra(newGraph, startNode, endNode, true);
    
    setPath([]);
    setVisitedNodes([]);
    setIsVisualizing(true);
    let i = 0;
    intervalRef.current = setInterval(() => {
      if (i < visited.length) {
        setVisitedNodes(prev => [...prev, visited[i]]);
        i++;
      } else {
        setPath(path);
        setIsVisualizing(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 100);
  };

  const handleClear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setNodes([]);
    setEdges([]);
    setStartNode(null);
    setEndNode(null);
    setPath([]);
    setVisitedNodes([]);
    setLastNode(null);
    setIsVisualizing(false);
    setIsAddingNodes(true);
    nodeIdCounter.current = 0;
    setMapKey(prevKey => prevKey + 1);
  };

  if (!isLoaded) return <div className="flex items-center justify-center h-screen text-3xl font-semibold text-gray-700">...Loading...</div>;

  return (
    <div className="relative min-h-screen bg-gray-900 text-white">
      <GoogleMap
        key={mapKey}
        mapContainerStyle={containerStyle}
        center={center}
        zoom={14}
        options={{ styles: mapStyles, disableDefaultUI: true, gestureHandling: "greedy" }}
        onClick={handleMapClick}
      >
        {edges.map((edge, i) => {
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          const midPoint = google.maps.geometry.spherical.interpolate(new google.maps.LatLng(fromNode.position), new google.maps.LatLng(toNode.position), 0.5);
          const isPathEdge = Array.isArray(path) && path.includes(edge.from) && path.includes(edge.to);

          return (
            <>
              <Polyline
                key={i}
                path={[fromNode.position, toNode.position]}
                options={{
                  strokeColor: isPathEdge ? "#ff8c00" : "#00ffff",
                  strokeOpacity: isPathEdge ? 1 : 0.7,
                  strokeWeight: isPathEdge ? 4 : 2,
                  zIndex: isPathEdge ? 3 : 1,
                }}
              />
              <OverlayView
                position={midPoint}
                mapPaneName={OverlayView.OVERLAY_LAYER}
              >
                <div className="bg-sky-600 text-white text-md font-semibold text-center rounded-4xl py-0.5 w-10">
                  {edge.weight} km
                </div>
              </OverlayView>
            </>
          );
        })}
        {nodes.map((node) => (
          <React.Fragment key={node.id}>
            <Marker
              position={node.position}
              icon={getNodeMarker(
                node.id,
                startNode === node.id ? "start" :
                endNode === node.id ? "end" :
                (Array.isArray(path) && path.includes(node.id)) ? "path" :
                (Array.isArray(visitedNodes) && visitedNodes.includes(node.id)) ? "visited" :
                "normal"
              )}
              onClick={() => handleNodeClick(node.id)}
              onRightClick={(e) => handleMarkerRightClick(e, node.id)}
            />
            <OverlayView
              position={node.position}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div style={{ position: 'absolute', transform: 'translate(-50%, -150%)', zIndex: 100 }}>
                <button onClick={(e) => handleDeleteButtonClick(e, node.id)} className="bg-red-500 text-white rounded-full p-1 shadow-lg" style={{ cursor: 'pointer' }}>
                  <FaTrash size={12} />
                </button>
              </div>
            </OverlayView>
          </React.Fragment>
        ))}
      </GoogleMap>
      <div className="absolute top-4 left-4 bg-gray-800/70 p-6 rounded-lg shadow-2xl flex flex-col gap-4 w-90">
        <h1 className="text-3xl font-bold text-lime-300">Dijkstra Visualizer</h1>
        <div className="flex gap-2">
          <button onClick={() => setIsAddingNodes(true)} 
          className={`font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all duration-300 ${isAddingNodes ? 'bg-gradient-to-r from-sky-500 to-sky-700 hover:from-sky-700 hover:to-sky-500' : 'bg-gradient-to-r from-sky-500 to-sky-700 hover:opacity-80'}`}>
            <FaPlus />
            <span>Add Nodes</span>
          </button>
          <button onClick={() => setIsAddingNodes(false)} 
          className={`font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all duration-300 ${!isAddingNodes ? 'bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-600 hover:to-purple-400' : 'bg-gradient-to-r from-purple-400 to-purple-700 hover:opacity-80'}`}>
            <span>Connect Nodes</span>
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={runVisualization} disabled={!startNode || !endNode || isVisualizing} 
          className="bg-gradient-to-r from-green-600 to-[#a0d500] hover:from-[#a0d500] hover:to-green-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all duration-300">
            <FaPlay />
            <span>Run</span>
          </button>
          <button onClick={handleClear} className="bg-gradient-to-r from-pink-600 to-orange-500 hover:from-orange-600 hover:to-pink-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-all duration-300">
            <FaTrash />
            <span>Clear All</span>
          </button>
        </div>
        <div className="text-sm flex flex-col gap-1">
          <p>1. Select <strong className="text-green-400">Add Nodes</strong> and click map to add.</p>
          <p>2. Select <strong className="text-blue-400">Connect Nodes</strong> to set start, end, and edges.</p>
          <p>3. Right-click a node to delete it.</p>
        </div>
        <div>
          <p>Start: <span className="font-bold text-green-400">{startNode || 'None'}</span></p>
          <p>End: <span className="font-bold text-pink-400">{endNode || 'None'}</span></p>
        </div>
      </div>
    </div>
  );
}
