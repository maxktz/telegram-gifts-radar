source .env

docker build -t telegram-gifts-radar .

docker run --rm telegram-gifts-radar bun run migrate

docker compose down && docker compose up -d