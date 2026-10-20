FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx libnginx-mod-rtmp gettext-base ca-certificates \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled /etc/nginx/modules-enabled
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 1935
ENTRYPOINT ["/entrypoint.sh"]
