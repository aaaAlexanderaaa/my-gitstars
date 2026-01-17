# GitHub Stars Manager

A web application that helps you manage your GitHub starred repositories with custom tags and better organization.


## Features

- 🔐 GitHub OAuth authentication
- ⭐ Sync and manage your starred repositories
- 🏷️ Add custom tags to repositories
- 🔍 Filter repositories by tags, language, and more
- 📖 Preview repository README files
- 🌓 Dark mode support
- 🔄 Real-time sync status tracking

## Tech Stack

- Frontend:
  - React
  - Material-UI
  - React Router
  - React Markdown
  - Axios

- Backend:
  - Node.js
  - Express
  - Passport.js
  - Sequelize ORM
  - PostgreSQL

- Infrastructure:
  - Docker
  - Docker Compose

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- GitHub OAuth App credentials

### Setup

1. Clone the repository:
```
git clone https://github.com/aaaAlexanderaaa/my-gitstars
```

2. Create a `.env` file in the root directory:
```
cp .env.example .env
```
Then fill your `GITHUB_CLIENT_SECRET` and `GITHUB_CLIENT_ID`
3. Start the application (choose one):

- Use the bundled Postgres container:
```
docker compose --profile local-db up --build
```

- Use an external Postgres (set `DB_HOST` / `DB_PORT` in `.env`):
```
docker compose up --build
```

4. Visit `http://localhost:4000` in your browser

### Development

- Frontend development server: `cd new_frontend && npm run dev`
- Backend development server: `cd backend && npm run dev`
- Database migrations: `cd backend && npm run migrate`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [GitHub API](https://docs.github.com/en/rest)
- [Material-UI](https://mui.com/)
- [React Markdown](https://github.com/remarkjs/react-markdown)
