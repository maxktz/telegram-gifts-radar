docker build -t telegram-gifts-radar .

docker run --rm -v "./sessions:/app/sessions" --env-file ./.env telegram-gifts-radar bun run migrate

docker compose down && docker compose up -d