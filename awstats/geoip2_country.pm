# AWStats plugin: geoip2_country
# Country lookup using MaxMind::DB::Reader (.mmdb format)
# Works with db-ip.com free country lite databases and MaxMind GeoLite2
package geoip2_country;
use strict;
use warnings;

my $reader;
my $enabled = 0;

sub Init {
    my ($parm, $dbfile) = @_;
    $dbfile ||= '/data/country.mmdb';

    unless (-f $dbfile) {
        warn "geoip2_country: database file not found: $dbfile\n";
        return 0;
    }

    eval { require MaxMind::DB::Reader; };
    if ($@) {
        warn "geoip2_country: MaxMind::DB::Reader not available: $@\n";
        return 0;
    }

    eval { $reader = MaxMind::DB::Reader->new(file => $dbfile); };
    if ($@) {
        warn "geoip2_country: failed to open $dbfile: $@\n";
        return 0;
    }

    $enabled = 1;
    return 1;
}

sub GetCountry {
    my $ip = shift;
    return _lookup($ip);
}

sub LookupCountry {
    my $ip = shift;
    return _lookup($ip);
}

sub _lookup {
    my $ip = shift;
    return '--' unless $enabled && $reader && $ip;

    my $rec = eval { $reader->record_for_address($ip) };
    return '--' if $@ || !defined $rec;

    # Handle different .mmdb schema layouts
    return $rec->{country}{iso_code}   # MaxMind GeoLite2-Country
        || $rec->{country}{code}       # db-ip.com country lite
        || $rec->{iso_code}            # flat layout
        || '--';
}

1;
