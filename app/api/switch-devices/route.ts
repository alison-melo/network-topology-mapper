import { NextRequest } from 'next/server';
import { getFdbTable, getLldpNeighbors } from '@/lib/snmp';

export async function POST(req: NextRequest) {
  try {
    const { switchIp } = await req.json();
    
    if (!switchIp) {
      return new Response(JSON.stringify({ error: 'Switch IP is required' }), { status: 400 });
    }

    // Get FDB table and LLDP neighbors concurrently
    const [fdbEntries, lldpNeighbors] = await Promise.all([
      getFdbTable(switchIp),
      getLldpNeighbors(switchIp)
    ]);

    // Create a set of trunk ports from LLDP neighbors
    const trunkPorts = new Set(lldpNeighbors.map(n => n.port));

    // Filter FDB entries to keep only those on edge ports (not in LLDP)
    const edgeDevices = fdbEntries.filter(entry => !trunkPorts.has(entry.port));

    return new Response(JSON.stringify({ devices: edgeDevices }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
