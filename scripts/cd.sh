# build container
docker build -t telegram-gifts-radar .

# deploy migrations
docker run --rm -v "./sessions:/app/sessions" --env-file ./.env telegram-gifts-radar bun run migrate