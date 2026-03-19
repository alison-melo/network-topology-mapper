export interface LldpNeighbor {
  mac?: string;
  name?: string;
  port?: string;
}

export interface Device {
  id: string; // Typically MAC address, but IP if MAC is unknown
  ip: string;
  mac?: string;
  name?: string;
  vendor?: string;
  status: 'up' | 'down';
  type: 'router' | 'switch' | 'ap' | 'end-device' | 'smartphone' | 'printer' | 'computer' | 'unknown';
  sysObjectID?: string;
  lastSeen: string;
  endDevices?: Device[];
  neighbors?: LldpNeighbor[]; // LLDP neighbors
}

export interface TopologyNode {
  data: {
    id: string;
    label: string;
    type: Device['type'];
    ip: string;
    vendor?: string;
    sysObjectID?: string;
    endDevices?: Device[];
  };
  classes?: string;
}

export interface TopologyEdge {
  data: {
    id: string;
    source: string;
    target: string;
    type: 'physical' | 'logical';
    sourceInterface?: string;
    targetInterface?: string;
  };
}
