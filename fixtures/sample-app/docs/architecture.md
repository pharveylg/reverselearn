# Architecture

```mermaid
flowchart LR
  UI[Browser UI - HomePage] --> API[API Route /api/tasks]
  API --> ORM[Prisma ORM]
  ORM --> DB[(Task Database)]
  API --> AUTH[User Sign-in]
```
