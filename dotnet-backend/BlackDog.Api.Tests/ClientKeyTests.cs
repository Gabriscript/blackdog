// =============================================================================
// The rate limit and the login lockout count per ClientKey. Keyed on the full
// IPv6 address, one VPS could rotate through its /64 and never hit either.
// =============================================================================
using System.Net;
using BlackDog.Api.Services;

namespace BlackDog.Api.Tests;

public class ClientKeyTests
{
    private static string Key(string ip) => ClientKey.For(IPAddress.Parse(ip));

    [Fact]
    public void Addresses_in_the_same_ipv6_64_share_one_key()
    {
        Assert.Equal(Key("2a01:4f8:1:2:aaaa::1"), Key("2a01:4f8:1:2:ffff:ffff:ffff:ffff"));
        Assert.Equal("2a01:4f8:1:2::/64", Key("2a01:4f8:1:2:aaaa::1"));
    }

    [Fact]
    public void Different_ipv6_64s_get_different_keys()
    {
        Assert.NotEqual(Key("2a01:4f8:1:2::1"), Key("2a01:4f8:1:3::1"));
    }

    [Fact]
    public void Ipv4_mapped_addresses_stay_per_ipv4_address()
    {
        // Their first 64 bits are all zero: truncated, all IPv4 would share one bucket.
        Assert.Equal("1.2.3.4", Key("::ffff:1.2.3.4"));
        Assert.NotEqual(Key("::ffff:1.2.3.4"), Key("::ffff:5.6.7.8"));
    }

    [Fact]
    public void Ipv4_is_the_address_itself()
    {
        Assert.Equal("1.2.3.4", Key("1.2.3.4"));
        Assert.Equal("unknown", ClientKey.For(null));
    }
}
