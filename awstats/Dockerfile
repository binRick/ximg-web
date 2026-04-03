FROM alpine:3.21

RUN apk add --no-cache \
    perl perl-utils \
    wget curl gzip \
    dcron ca-certificates \
    build-base

# Install cpanm
RUN curl -sSL https://cpanmin.us | perl - App::cpanminus

# Install MaxMind::DB::Reader (reads .mmdb files — works with db-ip.com free databases)
RUN cpanm --notest MaxMind::DB::Reader

# Download AWStats 7.9 from GitHub
RUN wget -q "https://github.com/eldy/awstats/archive/refs/tags/v7.9.tar.gz" \
        -O /tmp/awstats.tar.gz \
    && tar xf /tmp/awstats.tar.gz -C /opt \
    && mv /opt/awstats-7.9 /opt/awstats \
    && rm /tmp/awstats.tar.gz \
    && chmod +x /opt/awstats/wwwroot/cgi-bin/awstats.pl

ENV PATH="/opt/awstats/wwwroot/cgi-bin:/opt/awstats/tools:$PATH"

RUN mkdir -p /data /output /logs /configs

COPY geoip2_country.pm /opt/awstats/wwwroot/cgi-bin/plugins/geoip2_country.pm
COPY entrypoint.sh /entrypoint.sh
COPY update.sh /usr/local/bin/awstats-update.sh
COPY refresh-geoip.sh /usr/local/bin/refresh-geoip.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/awstats-update.sh /usr/local/bin/refresh-geoip.sh

ENTRYPOINT ["/entrypoint.sh"]
