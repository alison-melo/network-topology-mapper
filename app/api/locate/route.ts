import { NextRequest } from 'next/server';
import { walkArpTable, findMacInFdb, queryBasicSnmpInfo, getLldpNeighbors } from '@/lib/snmp';

export async function POST(req: NextRequest) {
  try {
    const { query, switches } = await req.json();
    
    if (!query || !switches || !Array.isArray(switches)) {
      return new Response(JSON.stringify({ error: 'Query and switches array are required' }), { status: 400 });
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
    for (const switchIp of switches) {
      try {
        const portName = await findMacInFdb(switchIp, targetMac);
        if (portName) {
          // Step C: Check LLDP to see if this is a trunk port
          const neighbors = await getLldpNeighbors(switchIp);
          const isTrunk = neighbors.some(n => n.port === portName);
          
          if (!isTrunk) {
            // Step D: Edge port found!
            const snmpInfo = await queryBasicSnmpInfo(switchIp);
            const switchName = snmpInfo?.name || switchIp;

            return new Response(JSON.stringify({
              found: true,
              mac: targetMac,
              switchIp,
              switchName,
              portName
            }), { status: 200 });
          }
        }
      } catch (err) {
        console.error(`Failed to query FDB/LLDP on ${switchIp}`, err);
      }
    }

    return new Response(JSON.stringify({ error: `Device with MAC ${targetMac} not found on any edge port` }), { status: 404 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
