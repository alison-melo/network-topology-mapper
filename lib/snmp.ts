import snmp from 'net-snmp';
import { Device, LldpNeighbor } from '@/types/network';
import { getDeviceInfoFromMac } from './mac-vendors';

// Standard OIDs
const OID_SYS_DESCR = '1.3.6.1.2.1.1.1.0';
const OID_SYS_OBJECT_ID = '1.3.6.1.2.1.1.2.0';
const OID_SYS_NAME = '1.3.6.1.2.1.1.5.0';
const OID_SYS_SERVICES = '1.3.6.1.2.1.1.7.0';
const OID_IP_NET_TO_MEDIA_PHYS_ADDRESS = '1.3.6.1.2.1.4.22.1.2'; // ARP Table MACs
const OID_IP_NET_TO_MEDIA_NET_ADDRESS = '1.3.6.1.2.1.4.22.1.3';  // ARP Table IPs
const OID_IF_PHYS_ADDRESS = '1.3.6.1.2.1.2.2.1.6'; // Interface MAC Addresses
const OID_LLDP_REM_ENTRY = '1.0.8802.1.1.2.1.4.1.1'; // LLDP Remote Entry Table
const OID_DOT1D_TP_FDB_PORT = '1.3.6.1.2.1.17.4.3.1.2'; // MAC to Bridge Port
const OID_DOT1D_BASE_PORT_IFINDEX = '1.3.6.1.2.1.17.1.4.1.2'; // Bridge Port to ifIndex
const OID_IF_NAME = '1.3.6.1.2.1.31.1.1.1.1'; // ifIndex to ifName

/**
 * Searches for a MAC address in the switch's FDB (Forwarding Database)
 * @param ip Switch IP
 * @param targetMac MAC address to find (format: XX:XX:XX:XX:XX:XX)
 * @param community SNMP community
 * @returns The port name where the MAC was found, or null
 */
export async function findMacInFdb(ip: string, targetMac: string, community: string = 'public'): Promise<string | null> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 2000,
      retries: 1,
      version: snmp.Version2c,
    });

    // Convert target MAC to decimal OID suffix format (e.g., 0.26.36.11.22.33)
    const macDecimals = targetMac.split(':').map(hex => parseInt(hex, 16)).join('.');
    const fdbOid = `${OID_DOT1D_TP_FDB_PORT}.${macDecimals}`;

    session.get([fdbOid], (error, varbinds) => {
      if (error || !varbinds || snmp.isVarbindError(varbinds[0])) {
        session.close();
        resolve(null);
        return;
      }

      const bridgePort = varbinds[0].value;
      if (bridgePort === null || bridgePort === undefined) {
        session.close();
        resolve(null);
        return;
      }

      // Now map bridgePort to ifIndex
      const basePortOid = `${OID_DOT1D_BASE_PORT_IFINDEX}.${bridgePort}`;
      session.get([basePortOid], (error2, varbinds2) => {
        if (error2 || !varbinds2 || snmp.isVarbindError(varbinds2[0])) {
          session.close();
          resolve(null);
          return;
        }

        const ifIndex = varbinds2[0].value;
        if (ifIndex === null || ifIndex === undefined) {
          session.close();
          resolve(null);
          return;
        }

        // Finally, get the ifName
        const ifNameOid = `${OID_IF_NAME}.${ifIndex}`;
        session.get([ifNameOid], (error3, varbinds3) => {
          session.close();
          if (error3 || !varbinds3 || snmp.isVarbindError(varbinds3[0])) {
            resolve(`Port Index ${ifIndex}`);
            return;
          }

          const portName = cleanSnmpString(varbinds3[0].value);
          resolve(portName || `Port Index ${ifIndex}`);
        });
      });
    });
  });
}

export async function getFdbTable(ip: string, community: string = 'public'): Promise<{ mac: string; port: string }[]> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 2000,
      retries: 1,
      version: snmp.Version2c,
    });

    const fdbEntries: { mac: string; bridgePort: number }[] = [];
    const bridgePortToIfIndex = new Map<number, number>();
    const ifIndexToName = new Map<number, string>();

    // Step 1: Walk FDB
    session.subtree(OID_DOT1D_TP_FDB_PORT, 20, (varbinds) => {
      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) continue;
        const oid = varbinds[i].oid;
        const bridgePortRaw = varbinds[i].value;
        if (bridgePortRaw === null || bridgePortRaw === undefined) continue;
        const bridgePort = parseInt(bridgePortRaw.toString(), 10);

        // Extract MAC from OID suffix
        const macDecimals = oid.split('.').slice(-6);
        if (macDecimals.length === 6) {
          const mac = macDecimals.map(d => parseInt(d, 10).toString(16).padStart(2, '0')).join(':').toUpperCase();
          fdbEntries.push({ mac, bridgePort });
        }
      }
    }, (error) => {
      if (error || fdbEntries.length === 0) {
        session.close();
        resolve([]);
        return;
      }

      // Step 2: Walk Bridge Port to ifIndex
      session.subtree(OID_DOT1D_BASE_PORT_IFINDEX, 20, (varbinds2) => {
        for (let i = 0; i < varbinds2.length; i++) {
          if (snmp.isVarbindError(varbinds2[i])) continue;
          const oid = varbinds2[i].oid;
          const ifIndexRaw = varbinds2[i].value;
          if (ifIndexRaw === null || ifIndexRaw === undefined) continue;
          const ifIndex = parseInt(ifIndexRaw.toString(), 10);

          const bridgePort = parseInt(oid.split('.').pop() || '0', 10);
          bridgePortToIfIndex.set(bridgePort, ifIndex);
        }
      }, (error2) => {
        
        // Step 3: Walk ifIndex to ifName
        session.subtree(OID_IF_NAME, 20, (varbinds3) => {
          for (let i = 0; i < varbinds3.length; i++) {
            if (snmp.isVarbindError(varbinds3[i])) continue;
            const oid = varbinds3[i].oid;
            const ifIndex = parseInt(oid.split('.').pop() || '0', 10);
            const ifName = cleanSnmpString(varbinds3[i].value);
            ifIndexToName.set(ifIndex, ifName);
          }
        }, (error3) => {
          session.close();

          // Assemble final results
          const results = fdbEntries.map(entry => {
            const ifIndex = bridgePortToIfIndex.get(entry.bridgePort);
            const portName = ifIndex ? (ifIndexToName.get(ifIndex) || `Port Index ${ifIndex}`) : `Bridge Port ${entry.bridgePort}`;
            return { mac: entry.mac, port: portName };
          });

          resolve(results);
        });
      });
    });
  });
}

// Basic Vendor mapping based on sysObjectID prefixes (Enterprise Numbers)
// This is a very simplified list. A real app would use a comprehensive database.
const VENDOR_MAP: Record<string, string> = {
  '1.3.6.1.4.1.9': 'Cisco',
  '1.3.6.1.4.1.14988': 'MikroTik',
  '1.3.6.1.4.1.2011': 'Huawei',
  '1.3.6.1.4.1.25506': 'H3C',
  '1.3.6.1.4.1.43': '3Com',
  '1.3.6.1.4.1.11': 'HP',
  '1.3.6.1.4.1.6486': 'Alcatel-Lucent',
  '1.3.6.1.4.1.2636': 'Juniper',
  '1.3.6.1.4.1.8072': 'Net-SNMP (Linux)',
};

/**
 * Cleans SNMP strings by converting Buffers to UTF-8 and stripping non-printable characters.
 */
export function cleanSnmpString(val: any): string {
  if (val === null || val === undefined) return '';
  let str = Buffer.isBuffer(val) ? val.toString('utf8') : val.toString();
  // Keep printable ASCII and common UTF-8, remove control characters
  return str.replace(/[^\x20-\x7E]/g, '').trim();
}

/**
 * Attempts to query basic system info via SNMP v2c.
 * @param ip Target IP address
 * @param community SNMP community string (default: 'public')
 * @returns Partial Device object with discovered info, or null if SNMP fails
 */
export async function queryBasicSnmpInfo(ip: string, community: string = 'public'): Promise<Partial<Device> | null> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 1000,
      retries: 1,
      version: snmp.Version2c,
    });

    const oids = [OID_SYS_NAME, OID_SYS_OBJECT_ID, OID_SYS_DESCR, OID_SYS_SERVICES];

    session.get(oids, (error, varbinds) => {
      if (error || !varbinds) {
        // SNMP not responding or wrong community
        session.close();
        resolve(null);
        return;
      }

      const info: Partial<Device> = {};
      let isL2orL3 = false;

      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) {
          continue;
        }

        const oid = varbinds[i].oid;
        const value = varbinds[i].value;

        if (oid === OID_SYS_NAME && value) {
          info.name = cleanSnmpString(value);
        } else if (oid === OID_SYS_OBJECT_ID && value) {
          info.sysObjectID = value.toString();
          
          // Try to guess vendor
          const vendorKey = Object.keys(VENDOR_MAP).find(prefix => info.sysObjectID?.startsWith(prefix));
          if (vendorKey) {
            info.vendor = VENDOR_MAP[vendorKey];
          }
        } else if (oid === OID_SYS_SERVICES && value !== null && value !== undefined) {
          const services = parseInt(value.toString(), 10);
          // sysServices is a 7-bit value. Layer 2 = 2^1 (2), Layer 3 = 2^2 (4)
          if ((services & 2) || (services & 4)) {
            isL2orL3 = true;
          }
        }
      }

      // Strict Topology Filter: Only classify as switch/router if it has L2/L3 services
      // or if it's a known infrastructure vendor (excluding Net-SNMP/Linux)
      const vendorKey = Object.keys(VENDOR_MAP).find(prefix => info.sysObjectID?.startsWith(prefix));
      if (isL2orL3 && vendorKey !== '1.3.6.1.4.1.8072' && vendorKey !== '1.3.6.1.4.1.311') {
        info.type = 'switch'; // We use 'switch' as a generic infra type for the map
      } else {
        info.type = 'computer'; // Will be filtered out of the main map
      }

      session.close();
      resolve(info);
    });
  });
}

/**
 * Formats a Buffer containing a MAC address into a standard hex string (XX:XX:XX:XX:XX:XX)
 */
function formatMacAddress(buffer: Buffer): string {
  if (!buffer || buffer.length !== 6) return '';
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

/**
 * Attempts to get the device's own MAC address via SNMP (ifPhysAddress).
 */
export async function getDeviceMacViaSnmp(ip: string, community: string = 'public'): Promise<string | null> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 1000,
      retries: 1,
      version: snmp.Version2c,
    });

    let foundMac: string | null = null;
    const maxRepetitions = 20;

    session.subtree(OID_IF_PHYS_ADDRESS, maxRepetitions, (varbinds) => {
      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) continue;

        const macBuffer = varbinds[i].value as Buffer;
        const mac = formatMacAddress(macBuffer);
        
        // Return the first valid MAC that isn't all zeros
        if (mac && mac !== '00:00:00:00:00:00' && !foundMac) {
          foundMac = mac;
        }
      }
    }, (error) => {
      session.close();
      resolve(foundMac);
    });
  });
}

/**
 * Discovers LLDP neighbors via SNMP.
 */
export async function getLldpNeighbors(ip: string, community: string = 'public'): Promise<LldpNeighbor[]> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 1500,
      retries: 1,
      version: snmp.Version2c,
    });

    const neighborsMap = new Map<string, { subtype?: number; chassisId?: Buffer | string; name?: string; port?: string }>();
    const maxRepetitions = 20;

    session.subtree(OID_LLDP_REM_ENTRY, maxRepetitions, (varbinds) => {
      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) continue;

        const oid = varbinds[i].oid;
        const val = varbinds[i].value;
        if (val === null || val === undefined) continue;

        // OID format: 1.0.8802.1.1.2.1.4.1.1.<column>.<timeMark>.<localPortNum>.<index>
        const match = oid.match(/1\.0\.8802\.1\.1\.2\.1\.4\.1\.1\.(\d+)\.(.+)$/);
        if (!match) continue;

        const column = parseInt(match[1], 10);
        const instance = match[2];

        if (!neighborsMap.has(instance)) {
          neighborsMap.set(instance, {});
        }
        const neighbor = neighborsMap.get(instance)!;

        if (column === 4) { // lldpRemChassisIdSubtype
          neighbor.subtype = parseInt(val.toString(), 10);
        } else if (column === 5) { // lldpRemChassisId
          neighbor.chassisId = Buffer.isBuffer(val) ? val : val.toString();
        } else if (column === 9) { // lldpRemSysName
          neighbor.name = cleanSnmpString(val);
        } else if (column === 7) { // lldpRemPortId
          neighbor.port = cleanSnmpString(val);
        }
      }
    }, (error) => {
      session.close();
      
      const results: LldpNeighbor[] = [];
      for (const neighbor of neighborsMap.values()) {
        let mac: string | undefined;
        
        if (neighbor.subtype === 4 && Buffer.isBuffer(neighbor.chassisId) && neighbor.chassisId.length === 6) {
          mac = formatMacAddress(neighbor.chassisId);
        } else if (Buffer.isBuffer(neighbor.chassisId) && neighbor.chassisId.length === 6) {
          mac = formatMacAddress(neighbor.chassisId);
        }
        
        if (mac || neighbor.name) {
          results.push({
            mac,
            name: neighbor.name,
            port: neighbor.port
          });
        }
      }
      
      resolve(results);
    });
  });
}

/**
 * Walks the ARP table (ipNetToMediaTable) to discover connected End-Devices.
 * @param ip Target IP address (usually a router/L3 switch)
 * @param community SNMP community string
 * @returns Array of discovered End-Devices
 */
export async function walkArpTable(ip: string, community: string = 'public'): Promise<Device[]> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, {
      timeout: 2000,
      retries: 1,
      version: snmp.Version2c,
    });

    const endDevices: Device[] = [];
    const maxRepetitions = 20;

    // We walk the MAC address column of the ARP table
    session.subtree(OID_IP_NET_TO_MEDIA_PHYS_ADDRESS, maxRepetitions, (varbinds) => {
      for (let i = 0; i < varbinds.length; i++) {
        if (snmp.isVarbindError(varbinds[i])) continue;

        const oid = varbinds[i].oid;
        const macBuffer = varbinds[i].value as Buffer;
        
        // The OID for ARP MAC is 1.3.6.1.2.1.4.22.1.2.<ifIndex>.<IP.Address>
        // We extract the IP address from the end of the OID
        const oidParts = oid.split('.');
        const ipParts = oidParts.slice(-4);
        const deviceIp = ipParts.join('.');
        
        const macAddress = formatMacAddress(macBuffer);

        if (macAddress && deviceIp && deviceIp !== '127.0.0.1' && deviceIp !== '0.0.0.0') {
          const deviceInfo = getDeviceInfoFromMac(macAddress);
          
          endDevices.push({
            id: macAddress,
            ip: deviceIp,
            mac: macAddress,
            type: deviceInfo?.type || 'end-device',
            vendor: deviceInfo?.vendor,
            status: 'up',
            lastSeen: new Date().toISOString(),
          });
        }
      }
    }, (error) => {
      session.close();
      if (error) {
        console.error(`Error walking ARP table on ${ip}:`, error.message);
      }
      resolve(endDevices);
    });
  });
}
