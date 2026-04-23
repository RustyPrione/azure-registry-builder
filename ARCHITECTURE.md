# Cloud Registry Builder - Architecture Documentation

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Browser)                     │
│  (HTML/CSS/JS in /public) - Cloud Registry Builder UI       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Express.js Backend (Node.js)                    │
│                   server.js (Port 3000)                      │
├─────────────────────────────────────────────────────────────-┤
│  Routes:                                                     │
│  ├─ /api/git       → Git operations (Bitbucket)              │
│  ├─ /api/azure     → Azure registry operations               │
│  ├─ /api/build     → Docker build & push operations          │
│  └─ /docs          → Swagger API documentation               │
├──────────────────────────────────────────────────────────────┤
│  Services (Utils):                                           │
│  ├─ gitService.js      → Bitbucket repo cloning & branching  │
│  ├─ azureService.js    → ACR registry/repo queries           │
│  └─ buildService.js    → Docker build & ACR push             │
├──────────────────────────────────────────────────────────────┤
│  Config:                                                     │
│  ├─ config/git.js      → Bitbucket credentials               │
│  └─ config/azure.js    → Azure credentials                   │
└──────────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│  Bitbucket API   │         │   Azure CLI      │
│  (Git repos)     │         │   (ACR, Docker)  │
└──────────────────┘         └──────────────────┘
```

## Component Breakdown

### 1. Frontend Layer (`/public`)

**Files:**
- `index.html` - Main UI structure
- `app.js` - Frontend logic and API interactions
- `styles.css` - Responsive styling

**Responsibilities:**
- User interface for selecting repos, branches, registries
- Form submission to backend APIs
- Real-time log streaming display
- Status updates and error handling

**Technologies:**
- Vanilla JavaScript (no framework dependencies)
- CSS3 with responsive design
- HTML5

---

### 2. Backend Layer - Express.js Server

#### Server Entry Point (`server.js`)

**Responsibilities:**
- Initialize Express application
- Configure CORS for cross-origin requests
- Mount all route handlers
- Serve static frontend files
- Set up UTF-8 encoding for cross-platform compatibility

**Key Features:**
- Runs on `localhost:3000`
- Serves static files from `/public`
- Routes all API requests

#### API Routes

##### **Git Routes** (`routes/gitRoutes.js`)
- **POST** `/api/git/branches` - Fetch branches from Bitbucket
- Uses: `gitService.getBranches()`
- Input: `{ repoUrl: string }`
- Output: `{ success: boolean, branches: string[] }`

##### **Azure Routes** (`routes/azureRoutes.js`)
- **GET** `/api/azure/registries` - List all Azure Container Registries
  - Uses: `azureService.getRegistries()`
  
- **POST** `/api/azure/repositories` - List repos in a registry
  - Uses: `azureService.getRepositories(registryName)`
  - Input: `{ registryName: string }`

##### **Build Routes** (`routes/buildRoutes.js`)
- **POST** `/api/build/push` - Build and push Docker image (streaming response)
  - Uses: `buildService.buildAndPushImageStreaming()`
  - Input: `{ repoUrl, branch, registryName, repository, tag }`
  - Output: NDJSON stream of build logs

#### Services (Business Logic)

##### **Git Service** (`utils/gitService.js`)

**Functions:**
- `getBranches(repoUrl)` - Clone repo and extract branch list
  - Normalizes Bitbucket URLs
  - Handles authentication with Bitbucket token
  - Stores temporary clones in `/repos`
  - Returns array of branch names

- `normalizeBitbucketUrl(repoUrl)` - Converts URL to standard format

- `addAuthToRepoUrl(cleanUrl)` - Injects Bitbucket credentials

- `resolveCloneUrlForBuild(repoUrl)` - Prepares URL for build operations

**Temporary Storage:**
- Cloned repos stored in `/repos` directory
- Cleaned up automatically after operations

**Dependencies:**
- `config/git.js` for Bitbucket credentials
- System `git` command
- Node.js `child_process` module

---

##### **Azure Service** (`utils/azureService.js`)

**Functions:**
- `getRegistries()` - Lists all ACR instances in Azure account
  - Requires Azure CLI authentication
  - Runs: `az acr list --query "[].name" -o tsv`
  - Returns: Array of registry names

- `getRepositories(registryName)` - Lists repos in a specific registry
  - Runs: `az acr repository list --name <registryName>`
  - Returns: Array of repository names

- `azureLogin()` - Authenticates with Azure
  - Uses service principal from `config/azure.js`
  - Sets environment variables for Azure CLI
  - Handles UTF-8 encoding on Windows

**Authentication Methods:**
1. Service principal (recommended) - via `config/azure.js`
2. Azure CLI session - fallback if logged in via `az login`

**Dependencies:**
- `config/azure.js` for Azure credentials
- Azure CLI (`az` command)
- Node.js `child_process` module

---

##### **Build Service** (`utils/buildService.js`)

**Functions:**
- `buildAndPushImageStreaming(config, sessionId)` - Main build pipeline
  - Steps:
    1. Validates input parameters
    2. Resolves repository URL with auth
    3. Creates working directory
    4. Clones repository at specific branch
    5. Runs `az acr build` to build and push to ACR
    6. Streams logs to client
    7. Cleans up temporary files

- Helper functions:
  - `validateBuildBody()` - Input validation
  - `assertValidRepositoryAndTag()` - Image name validation
  - `removeRepoClone()` - Cleanup with retries (Windows-safe)

**Log Streaming:**
- NDJSON (newline-delimited JSON) format
- Each log entry: `{ type, message, at: timestamp }`
- Real-time transmission to UI

**Windows Compatibility:**
- Proper UTF-8 encoding setup
- Retry logic for file deletion (Windows file locking)
- Process environment variable handling

**Dependencies:**
- `@google-cloud/artifact-registry`
- Azure CLI (`az acr build`)
- Docker
- Git
- Node.js `child_process` module

---

#### Configuration Files

##### **Git Configuration** (`config/git.js`)
```javascript
const gitConfig = {
  BITBUCKET_USER: "username",
  BITBUCKET_TOKEN: "app_password"
};
```

**Values:**
- `BITBUCKET_USER` - Bitbucket username
- `BITBUCKET_TOKEN` - Bitbucket App Password (with repo read permissions)

**Retrieved from:**
- Bitbucket Settings → Personal Settings → App passwords

---

##### **Azure Configuration** (`config/azure.js`)
```javascript
const azureConfig = {
  AZURE_CLIENT_ID: "client_id",
  AZURE_TENANT_ID: "tenant_id",
  AZURE_CLIENT_SECRET: "client_secret"
};
```

**Values:**
- `AZURE_CLIENT_ID` - Service principal app ID
- `AZURE_TENANT_ID` - Azure AD tenant ID
- `AZURE_CLIENT_SECRET` - Service principal secret

**Retrieved from:**
- Created via `az ad sp create-for-rbac`
- Service principal must have "Contributor" or equivalent role

---

#### Swagger/OpenAPI Documentation

**File:** `swagger.js`

**Endpoint:** `GET /docs`

**Features:**
- Auto-generated API documentation
- Interactive swagger-ui for testing endpoints
- Request/response schemas
- Try-it-out functionality from browser

---

### 3. External Services

#### Bitbucket
- **Purpose:** Source code repository
- **Operations:**
  - Clone repositories
  - List branches
- **Authentication:** App Password (token-based)
- **Rate Limits:** Standard Bitbucket API rate limits apply

#### Azure Container Registry (ACR)
- **Purpose:** Docker image storage and deployment
- **Operations:**
  - List registries
  - List repositories
  - Build and push images via Azure CLI
- **Authentication:** Service Principal (Azure AD)
- **Requirements:**
  - Contributor role (minimum)
  - ACR instances already created

#### Azure Active Directory (AAD)
- **Purpose:** Authentication and authorization
- **Used by:** Service principal for Azure CLI authentication

---

### 4. Storage & Temporary Files

#### `/repos` Directory
- **Purpose:** Temporary storage for cloned repositories
- **Lifecycle:**
  - Created when branch list is fetched
  - Created when build is initiated
  - Deleted after build completion
  - Manually cleans up corrupted repos

**Characteristics:**
- Auto-created if doesn't exist
- Safe cleanup with retry logic
- Helps avoid re-cloning same repos

---

## Data Flow

### Scenario: Building and Pushing a Docker Image

```
1. USER ACTION: Select repo, branch, registry, image name
   ↓
2. FRONTEND: POST /api/git/branches { repoUrl }
   ↓
3. gitService.getBranches()
   - Clone repo to /repos
   - Extract branches
   ↓
4. FRONTEND: Display branches, user selects one
   ↓
5. USER ACTION: Click Build & Push
   ↓
6. FRONTEND: POST /api/build/push { repoUrl, branch, registryName, repository, tag }
   ↓
7. buildService.buildAndPushImageStreaming()
   - Validate parameters
   - Resolve git clone URL with auth
   - Clone repo at branch (/repos)
   - Authenticate to Azure
   - Spawn: az acr build --registry ... --image ... .
   ↓
8. STREAMING: Each log line sent as NDJSON to frontend
   ↓
9. FRONTEND: Display logs in real-time UI
   ↓
10. BUILD COMPLETION:
    - buildService cleans up cloned repo
    - Frontend shows success/failure
    ↓
11. IMAGE AVAILABLE: Docker image pushed to Azure ACR
```

---

## Error Handling

### Common Error Scenarios

| Scenario | Error | Handling |
|----------|-------|----------|
| Invalid Bitbucket URL | "Invalid Bitbucket URL" | Validate URL format before cloning |
| Bitbucket auth failure | stderr from git command | Check BITBUCKET_USER and BITBUCKET_TOKEN |
| Azure login failure | "Azure CLI error" | Check service principal credentials |
| Docker file missing | Build fails | Ensure Dockerfile exists in repo root |
| Image name with spaces | "cannot contain spaces" | Validate and reject at API level |
| Port 3000 in use | Server fails to start | Change PORT or kill conflicting process |

---

## Security Considerations

1. **Credential Storage**
   - Credentials in `config/` files should be secured
   - Consider using environment variables instead
   - Never commit credentials to version control

2. **Bitbucket Token**
   - App Password should have limited scopes
   - Regenerate if compromised

3. **Azure Service Principal**
   - Use least privilege roles (not "Owner")
   - Rotate secrets regularly
   - Monitor in Azure Portal

4. **CORS Policy**
   - Currently allows `origin: "*"`
   - Restrict in production to your domain

---

## Performance Notes

- **Git Cloning**: Depends on repo size and network speed
- **Build Time**: Depends on Dockerfile complexity and Azure ACR build queue
- **Log Streaming**: Uses NDJSON for efficient real-time updates
- **Concurrent Builds**: Multiple users can build simultaneously with separate session logs

---

## Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | HTML5, CSS3, Vanilla JS | - |
| **Backend** | Node.js, Express.js | 5.2.1 |
| **API Docs** | Swagger/OpenAPI | 6.2.8 |
| **HTTP Server** | Express | 5.2.1 |
| **Authentication** | Bitbucket tokens, Azure service principal | - |
| **External Tools** | Git, Azure CLI, Docker | Required |
| **Container Runtime** | Docker | Required |
