FROM fedora:41

# Install dnf plugins (for dnf download) + Flask
RUN dnf install -y dnf-plugins-core python3 python3-pip && \
    pip3 install flask && \
    dnf clean all

WORKDIR /app
COPY server.py .
COPY favicon.svg .
EXPOSE 3007
CMD ["python3", "server.py"]
