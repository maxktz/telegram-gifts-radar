docker build -t telegram-gifts-radar .

docker run --rm -v "./.env:/app/.env" telegram-gifts-radar bun run migrate

docker compose down && docker compose up -d