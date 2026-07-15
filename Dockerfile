FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py bridge.py config.py db.py migrate.py production_check.py scheduler.py setup_commands.py \
     ai_gen.py ai_image.py image_fetcher.py user_keys.py content_history.py docker-entrypoint.sh ./
COPY migrations ./migrations

RUN useradd --system --create-home --uid 10001 bot \
    && chown -R bot:bot /app \
    && chmod 755 /app/docker-entrypoint.sh

USER bot

HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,os,sys; p=os.getenv('BRIDGE_PORT') or os.getenv('PORT'); sys.exit(0) if not p else urllib.request.urlopen(f'http://127.0.0.1:{p}/health', timeout=4)" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
