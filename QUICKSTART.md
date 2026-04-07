# Quick Start Guide

Get your Cloud Registry Builder up and running in 10 minutes.

---

## Prerequisites

Before you begin, ensure you have installed:
- [Node.js](https://nodejs.org/) (v14+)
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- Bitbucket account with repository access
- Azure account with Container Registry (ACR) created

---

## 5-Minute Setup

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd azure-registry
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Bitbucket

Generate a Bitbucket App Password:
1. Go to [Bitbucket Settings → App passwords](https://bitbucket.org/account/settings/app-passwords/)
2. Click **Create app password**
3. Label: "Cloud Registry Builder"
4. Grant: ✅ `Repositories: read`
5. Copy the generated token

Create `config/git.js`:
```javascript
const gitConfig = {
  BITBUCKET_USER: "your-bitbucket-username",
  BITBUCKET_TOKEN: "your-app-password"
};

module.exports = { gitConfig };
```

### Step 4: Configure Azure

Create a Service Principal:
```bash
az login
az account show --query id --output tsv  # Copy this
az ad sp create-for-rbac --name cloud-registry-builder \
  --role Contributor \
  --scopes /subscriptions/<paste-subscription-id>
```

Create `config/azure.js`:
```javascript
const azureConfig = {
  AZURE_CLIENT_ID: "appId-from-above",
  AZURE_TENANT_ID: "tenant-from-above",
  AZURE_CLIENT_SECRET: "password-from-above"
};

module.exports = { azureConfig };
```

### Step 5: Start the Application
```bash
npm start
```
Server starts on `http://localhost:3000`

---

## First Build

1. Open `http://localhost:3000` in your browser
2. Enter a Bitbucket repo URL: `https://bitbucket.org/org/project.git`
3. Click "Get Branches"
4. Select a branch from dropdown
5. Choose your Azure Container Registry
6. Enter image name (e.g., `my-app`) and tag (e.g., `v1.0.0`)
7. Click **Build & Push**
8. Watch real-time logs as your image is built and pushed

---

## Verify Everything Works

### Test Bitbucket Connection
```bash
git clone https://user:token@bitbucket.org/org/repo.git /tmp/test-clone
```
Should work without password prompt.

### Test Azure Connection
```bash
az login --service-principal -u <CLIENT_ID> -p <CLIENT_SECRET> --tenant <TENANT_ID>
az acr list --query "[].name"
```
Should list your registries.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `npm start` uses a different port or kill process on 3000 |
| Bitbucket auth fails | Check username and token in `config/git.js` |
| Azure auth fails | Verify service principal with `az login` |
| Build fails | Ensure repo has `Dockerfile` at root |
| Image name error | Use hyphens/underscores only: `my-app` not `my app` |

---

## Next Steps

- Read [CONFIGURATION.md](./CONFIGURATION.md) for detailed credential setup
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
- Check [README.md](./README.md) for complete documentation
- View API docs at `http://localhost:3000/docs` (Swagger UI)

---

## 📸 Application Screenshots

### Full UI Overview
![Cloud Registry Builder Interface](screenshots/1.png)

The main interface shows all three workflow sections:
1. **Source** - Enter Bitbucket repo URL and fetch branches
2. **Registry** - Select Azure Container Registry and repository
3. **Image & Build** - Specify tag and start the build process

### Branch Selection
![Branch Dropdown](screenshots/2.png)

After entering a Bitbucket URL and clicking "Get Branches", select from the available branches list.

### Registry Selection
![Registry Dropdown](screenshots/3.png)

Browse and select from all available Azure Container Registries in your account.

### Build Progress
![Real-time Build Logs](screenshots/4.png)

Watch real-time logs as your Docker image is built and pushed to Azure ACR. See build metrics, image size, and the final image URL.

---

Happy building! 🚀
