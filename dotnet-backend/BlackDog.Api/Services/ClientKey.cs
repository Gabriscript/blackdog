// =============================================================================
// ClientKey — who counts as "one visitor" for the rate limit and the login
// lockout. IPv4: the address. IPv6: its /64, because any VPS gets a whole /64
// and could rotate through 2^64 addresses, each with a fresh bucket.
// =============================================================================
using System.Net;
using System.Net.Sockets;

namespace BlackDog.Api.Services;

public static class ClientKey
{
    public static string For(IPAddress? ip)
    {
        if (ip is null) return "unknown";
        // ::ffff:1.2.3.4 has an all-zero /64: unmapped, every IPv4 visitor would share one bucket.
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (ip.AddressFamily != AddressFamily.InterNetworkV6) return ip.ToString();

        var bytes = ip.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"{new IPAddress(bytes)}/64";
    }
}
