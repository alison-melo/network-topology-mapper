import { Device } from '@/types/network';

export interface TopologyNode {
  id: string;
  ip: string;
  name: string;
  type: string;
  vendor?: string;
  children: TopologyNode[];
  connectionToParent?: {
    sourcePort: string;
    targetPort: string;
  };
}

export function buildTopologyTree(devices: Device[]): TopologyNode[] {
  // Filter only infrastructure devices
  const infraDevices = devices.filter(
    (d) => d.type === 'switch' || d.type === 'router' || d.type === 'ap'
  );

  // Create a map for quick lookup
  const deviceMap = new Map<string, Device>();
  infraDevices.forEach((d) => {
    deviceMap.set(d.ip, d);
    if (d.mac) deviceMap.set(d.mac.toLowerCase(), d);
    if (d.name) deviceMap.set(d.name.toLowerCase(), d);
  });

  // Extract all edges
  interface Edge {
    sourceId: string;
    targetId: string;
    sourcePort: string;
    targetPort: string;
  }
  const edges: Edge[] = [];

  infraDevices.forEach((device) => {
    if (device.neighbors) {
      device.neighbors.forEach((neighbor) => {
        // Try to find the neighbor in our scanned devices
        let targetDevice = deviceMap.get(neighbor.name?.toLowerCase() || '');
        if (!targetDevice && neighbor.mac) {
          targetDevice = deviceMap.get(neighbor.mac.toLowerCase());
        }

        if (targetDevice) {
          edges.push({
            sourceId: device.id,
            targetId: targetDevice.id,
            sourcePort: 'Unknown', // We don't have local port easily from LLDP remote table
            targetPort: neighbor.port || 'Unknown',
          });
        }
      });
    }
  });

  // 1. DEDUPLICAÇÃO DE LINKS
  const uniqueEdges: Edge[] = [];
  const seenLinks = new Map<string, Edge>();

  edges.forEach((edge) => {
    // Create a unique key for the pair, regardless of direction
    const [nodeA, nodeB] = [edge.sourceId, edge.targetId].sort();
    const linkKey = `${nodeA}-${nodeB}`;

    if (!seenLinks.has(linkKey)) {
      seenLinks.set(linkKey, edge);
      uniqueEdges.push(edge);
    } else {
      // We already have an edge for this pair.
      // Combine the port information if available.
      const existingEdge = seenLinks.get(linkKey)!;
      
      if (edge.sourceId === existingEdge.targetId && edge.targetId === existingEdge.sourceId) {
        // The current edge is the reverse of the existing edge.
        // The current edge's targetPort is the port on existingEdge.sourceId.
        if (existingEdge.sourcePort === 'Unknown' && edge.targetPort !== 'Unknown') {
          existingEdge.sourcePort = edge.targetPort;
        }
        // And the current edge's sourcePort would be the port on existingEdge.targetId.
        if (existingEdge.targetPort === 'Unknown' && edge.sourcePort !== 'Unknown') {
          existingEdge.targetPort = edge.sourcePort;
        }
      } else if (edge.sourceId === existingEdge.sourceId && edge.targetId === existingEdge.targetId) {
        // Same direction
        if (existingEdge.sourcePort === 'Unknown' && edge.sourcePort !== 'Unknown') {
          existingEdge.sourcePort = edge.sourcePort;
        }
        if (existingEdge.targetPort === 'Unknown' && edge.targetPort !== 'Unknown') {
          existingEdge.targetPort = edge.targetPort;
        }
      }
    }
  });

  // 2. CONSTRUÇÃO DA ÁRVORE
  // Determine root: device with most connections, prefer router
  const connectionCounts = new Map<string, number>();
  uniqueEdges.forEach((edge) => {
    connectionCounts.set(edge.sourceId, (connectionCounts.get(edge.sourceId) || 0) + 1);
    connectionCounts.set(edge.targetId, (connectionCounts.get(edge.targetId) || 0) + 1);
  });

  let rootDevice: Device | null = null;
  let maxConns = -1;

  infraDevices.forEach((d) => {
    const conns = connectionCounts.get(d.id) || 0;
    // Boost router score to prefer it as root
    const score = conns + (d.type === 'router' ? 100 : 0);
    if (score > maxConns) {
      maxConns = score;
      rootDevice = d;
    }
  });

  if (!rootDevice && infraDevices.length > 0) {
    rootDevice = infraDevices[0];
  }

  if (!rootDevice) return [];

  const buildNode = (device: Device, visited: Set<string>, parentEdge?: Edge): TopologyNode => {
    visited.add(device.id);

    const node: TopologyNode = {
      id: device.id,
      ip: device.ip,
      name: device.name || device.ip,
      type: device.type,
      vendor: device.vendor,
      children: [],
    };

    if (parentEdge) {
      // Determine which port is local and which is remote relative to this node
      // If parentEdge.sourceId === device.id, then this device is the source of the edge.
      // So the port on this device is sourcePort.
      // The port on the parent is targetPort.
      const isSource = parentEdge.sourceId === device.id;
      node.connectionToParent = {
        sourcePort: isSource ? parentEdge.targetPort : parentEdge.sourcePort,
        targetPort: isSource ? parentEdge.sourcePort : parentEdge.targetPort,
      };
    }

    // Find all children
    const childEdges = uniqueEdges.filter(
      (e) => e.sourceId === device.id || e.targetId === device.id
    );

    childEdges.forEach((edge) => {
      const childId = edge.sourceId === device.id ? edge.targetId : edge.sourceId;
      if (!visited.has(childId)) {
        const childDevice = infraDevices.find((d) => d.id === childId);
        if (childDevice) {
          node.children.push(buildNode(childDevice, visited, edge));
        }
      }
    });

    return node;
  };

  const allVisited = new Set<string>();
  const trees: TopologyNode[] = [];

  // Build tree from root
  trees.push(buildNode(rootDevice, allVisited));

  // Find disconnected subtrees
  infraDevices.forEach((d) => {
    if (!allVisited.has(d.id)) {
      trees.push(buildNode(d, allVisited));
    }
  });

  return trees;
}
