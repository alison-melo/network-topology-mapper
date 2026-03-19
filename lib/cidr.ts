import IPCIDR from 'ip-cidr';

function ipToInt(ip: string): number {
  return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
}

function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.');
}

export function getIpsFromRange(rangeStr: string): string[] {
  const parts = rangeStr.split('-');
  if (parts.length !== 2) throw new Error(`Invalid range format: ${rangeStr}`);
  
  const startIp = parts[0].trim();
  const endIp = parts[1].trim();
  
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(startIp) || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(endIp)) {
    throw new Error(`Invalid IP in range: ${rangeStr}`);
  }

  const start = ipToInt(startIp);
  const end = ipToInt(endIp);
  
  if (start > end) throw new Error(`Start IP must be less than or equal to End IP in range: ${rangeStr}`);
  
  // Prevent massive ranges that would crash the app (e.g., > 65536 IPs)
  if (end - start > 65536) {
    throw new Error(`Range too large: ${rangeStr}. Maximum allowed is 65536 IPs per range.`);
  }
  
  const ips: string[] = [];
  for (let i = start; i <= end; i++) {
    ips.push(intToIp(i));
  }
  return ips;
}

/**
 * Converts a CIDR string (e.g., "192.168.1.0/24") into an array of IP addresses.
 * @param cidrStr The CIDR notation string.
 * @returns An array of IP addresses.
 */
export function getIpsFromCidr(cidrStr: string): string[] {
  try {
    const cidr = new IPCIDR(cidrStr);
    
    // toArray() returns all IPs in the range, including network and broadcast addresses
    // We usually want to skip the first (network) and last (broadcast) for standard subnets
    const ips = cidr.toArray();
    
    if (ips.length > 2) {
      // Return usable IPs (skip network and broadcast)
      return ips.slice(1, -1);
    }
    
    return ips;
  } catch (error) {
    throw new Error(`Invalid CIDR format: ${cidrStr}`);
  }
}

/**
 * Parses a comma-separated list of CIDRs, IP ranges, or single IPs.
 * @param input The input string (e.g., "192.168.1.0/24, 10.0.0.1-10.0.0.50, 172.16.0.5")
 * @returns An array of unique IP addresses.
 */
export function parseNetworkInput(input: string): string[] {
  const parts = input.split(',').map(p => p.trim()).filter(p => p.length > 0);
  const allIps = new Set<string>();
  
  for (const part of parts) {
    if (part.includes('/')) {
      const ips = getIpsFromCidr(part);
      ips.forEach(ip => allIps.add(ip));
    } else if (part.includes('-')) {
      const ips = getIpsFromRange(part);
      ips.forEach(ip => allIps.add(ip));
    } else {
      // Assume single IP
      if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(part)) {
        allIps.add(part);
      } else {
        throw new Error(`Invalid IP format: ${part}`);
      }
    }
  }
  
  return Array.from(allIps);
}
