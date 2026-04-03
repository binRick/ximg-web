FROM jasonrivers/nagios:latest

# Disable CGI authentication for public read-only access
RUN sed -i 's/^use_authentication=1/use_authentication=0/' /opt/nagios/etc/cgi.cfg

# Disable external command submission (enforce read-only) and notifications (no email)
RUN sed -i \
    -e 's/^check_external_commands=1/check_external_commands=0/' \
    -e 's/^enable_notifications=1/enable_notifications=0/' \
    /opt/nagios/etc/nagios.cfg

# Remove Apache-level authentication (open read-only access)
COPY nagios-apache.conf /etc/apache2/sites-available/nagios.conf

# Add ximg.app host and service monitoring definitions
COPY ximg-hosts.cfg /opt/nagios/etc/objects/ximg-hosts.cfg
COPY ximg-services.cfg /opt/nagios/etc/objects/ximg-services.cfg
