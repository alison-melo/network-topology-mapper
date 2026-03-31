import { NextRequest } from 'next/server';
import { walkArpTable, findMacInFdb, queryBasicSnmpInfo, getLldpNeighbors } from '@/lib/snmp';

export async function POST(req: NextRequest) {
  try {
    const { query, switches, devices } = await req.json();
    
    if (!query || !switches || !Array.isArray(switches)) {
      return new Response(JSON.stringify({ error: 'Query, switches array, and devices are required' }), { status: 400 });
    }

    const isMac = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query);
    const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(query);

    if (!isMac && !isIp) {
      return new Response(JSON.stringify({ error: 'Invalid IP or MAC address format' }), { status: 400 });
    }

    let targetMac = query.toUpperCase().replace(/-/g, ':');

    // Step A: If it's an IP, find its MAC address via ARP tables of the switches
    if (isIp) {
      let foundMac = null;
      for (const switchIp of switches) {
        try {
          const arpEntries = await walkArpTable(switchIp);
          const entry = arpEntries.find(d => d.ip === query);
          if (entry && entry.mac) {
            foundMac = entry.mac;
            break;
          }
        } catch (err) {
          console.error(`Failed to walk ARP table on ${switchIp}`, err);
        }
      }

      if (!foundMac) {
        return new Response(JSON.stringify({ error: `Could not resolve MAC address for IP ${query}` }), { status: 404 });
      }
      targetMac = foundMac;
    }

    // Step B, C, D: Find Edge Port
    const foundLocations: Array<{
      switchIp: string;
      switchName: string;
      portName: string;
      isTrunk: boolean;
      neighbors: any[];
    }> = [];

    for (const switchIp of switches) {
      try {
        const portName = await findMacInFdb(switchIp, targetMac);
        if (portName) {
          // Step C: Check LLDP to see if this is a trunk port
          const neighbors = await getLldpNeighbors(switchIp);
          const isTrunk = neighbors.some(n => n.port === portName);

          const snmpInfo = await queryBasicSnmpInfo(switchIp);
          const switchName = snmpInfo?.name || switchIp;

          foundLocations.push({
            switchIp,
            switchName,
            portName,
            isTrunk,
            neighbors
          });
        }
      } catch (err) {
        console.error(`Failed to query FDB/LLDP on ${switchIp}`, err);
      }
    }

    // Filter to edge ports only (not trunk)
    const edgeLocations = foundLocations.filter(loc => !loc.isTrunk);

    if (edgeLocations.length === 0) {
      if (foundLocations.length > 0) {
        return new Response(JSON.stringify({
          error: `MAC ${targetMac} encontrado apenas em portas trunk (${foundLocations.length} localizações). Verifique configuração de rede.`
        }), { status: 404 });
      }
      return new Response(JSON.stringify({ error: `Device with MAC ${targetMac} not found on any edge port` }), { status: 404 });
    }

    if (edgeLocations.length > 1) {
      // Multiple edge locations - for now, return first with warning
      // TODO: Implement topology-aware final location detection
      const locationsStr = edgeLocations.map(loc => `${loc.switchName}:${loc.portName}`).join(', ');
      const firstLocation = edgeLocations[0];
      
      return new Response(JSON.stringify({
        found: true,
        mac: targetMac,
        switchIp: firstLocation.switchIp,
        switchName: firstLocation.switchName,
        portName: firstLocation.portName,
        warning: `MAC encontrado em múltiplas localizações (${locationsStr}). Usando primeira como estimativa.`,
        allLocations: edgeLocations
      }), { status: 200 });
    }

    // Single edge location found - this is the correct one
    const location = edgeLocations[0];
    return new Response(JSON.stringify({
      found: true,
      mac: targetMac,
      switchIp: location.switchIp,
      switchName: location.switchName,
      portName: location.portName
    }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
