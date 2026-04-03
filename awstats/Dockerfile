FROM alpine:3.21

# awstats from Alpine community; make is needed for Geo::IPfree CPAN build
RUN apk add --no-cache \
    awstats \
    wget \
    dcron \
    ca-certificates \
    make

# Install Geo::IPfree — pure-Perl IP→country lookup, bundled IP database
# Used by AWStats' built-in geoipfree plugin
RUN wget -q -O /usr/local/bin/cpanm https://cpanmin.us && chmod +x /usr/local/bin/cpanm \
    && cpanm --notest Geo::IPfree \
    && rm /usr/local/bin/cpanm

RUN mkdir -p /data /output /logs /configs

COPY entrypoint.sh /entrypoint.sh
COPY update.sh /usr/local/bin/awstats-update.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/awstats-update.sh

ENTRYPOINT ["/entrypoint.sh"]
