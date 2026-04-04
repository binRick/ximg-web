FROM jasonrivers/nagios:latest

# Disable CGI authentication and remove pagination limit
RUN sed -i \
    -e 's/^use_authentication=1/use_authentication=0/' \
    -e 's/^result_limit=.*/result_limit=0/' \
    /opt/nagios/etc/cgi.cfg

# Disable external command submission (enforce read-only) and notifications (no email)
RUN sed -i \
    -e 's/^check_external_commands=1/check_external_commands=0/' \
    -e 's/^enable_notifications=1/enable_notifications=0/' \
    /opt/nagios/etc/nagios.cfg

# Remove Apache-level authentication (open read-only access)
COPY nagios-apache.conf /etc/apache2/sites-available/nagios.conf

# Add nagios user to the docker group (GID 992 on this host) so it can read the socket
RUN groupadd -g 992 docker 2>/dev/null || true && \
    usermod -aG docker nagios

# Install custom check scripts
COPY check_docker.py   /opt/nagios/libexec/check_docker.py
COPY check_suricata.sh /opt/nagios/libexec/check_suricata.sh
RUN chmod +x /opt/nagios/libexec/check_docker.py \
             /opt/nagios/libexec/check_suricata.sh

# Hide Nagios branding (version string, homepage link, "Logged in as ?", notifications disabled)
RUN cat >> /opt/nagios/share/stylesheets/common.css <<'EOF'

/* ximg.app: hide branding */
a.homepageURL, .infoBoxBadProcStatus { display: none !important; }
EOF

RUN cat >> /opt/nagios/share/js/nag_funcs.js <<'EOF'

// ximg.app: remove version/login/notifications text nodes from infoBox
$(document).ready(function(){
    var t=$('td.infoBox');
    t.contents().filter(function(){
        return this.nodeType===3&&/^(Nagios|Logged in)/.test(this.nodeValue.trim());
    }).remove();
    t.find('a.homepageURL,i').remove();
    $('.infoBoxBadProcStatus').remove();
    t.find('br').slice(2).remove();
});
EOF

# Add ximg.app host and service monitoring definitions.
# Copy to both the live path and /orig/etc (startup fallback) so they survive
# volume re-initialization on fresh deploys.
COPY ximg-hosts.cfg    /opt/nagios/etc/conf.d/ximg-hosts.cfg
COPY ximg-hosts.cfg    /orig/etc/conf.d/ximg-hosts.cfg
COPY ximg-services.cfg /opt/nagios/etc/conf.d/ximg-services.cfg
COPY ximg-services.cfg /orig/etc/conf.d/ximg-services.cfg
