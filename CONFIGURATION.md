# Configuration Setup Guide

This guide walks you through setting up all required configuration files for the Cloud Registry Builder application.

## Overview

Your application integrates with two external systems:
1. **Bitbucket** - Source code repository management
2. **Azure** - Cloud infrastructure and container registry

Both require credentials to be configured in the `/config` folder.

---

## Step 1: Bitbucket Configuration

### File: `config/git.js`

This file stores your Bitbucket authentication credentials.

### How to Get Bitbucket Credentials

#### Step 1a: Get Your Bitbucket Username

1. Go to [bitbucket.org](https://bitbucket.org)
2. Sign in with your account
3. Click your profile icon (top-right) → **Personal settings**
4. Your username is displayed on the Personal settings page
   - Example: `muthukumarsadhasivam`

#### Step 1b: Create a Bitbucket App Password

App Passwords are more secure than using your main password. They can be revoked without changing your account password.

1. Go to Bitbucket → Personal settings → **App passwords**
   - Or directly: https://bitbucket.org/account/settings/app-passwords/
2. Click **Create app password**
3. **Label**: "Cloud Registry Builder" (or any name you prefer)
4. **Permissions**: Select only:
   - ✅ `Repositories: read`
   - (You don't need write permissions)
5. Click **Create**
6. **IMPORTANT**: Copy the generated token immediately (it will only be shown once)
   - Example token: `ATATT3xFfGF0_agH1x2LvYK... (much longer)`

#### Step 1c: Update `config/git.js`

Create or edit the file `config/git.js`:

```javascript
const gitConfig = {
  BITBUCKET_USER: "your-username-here",
  BITBUCKET_TOKEN: "your-app-password-here"
};

module.exports = { gitConfig };
```

**Example:**
```javascript
const gitConfig = {
  BITBUCKET_USER: "rajaragavan.iyappan@phtn.com",
  BITBUCKET_TOKEN: "YOUR_BITBUCKET_TOKEN"
};

module.exports = { gitConfig };
```

**Verification:**
```bash
# Test your credentials
git clone https://BITBUCKET_USER:BITBUCKET_TOKEN@bitbucket.org/org/repo.git
# Should work without asking for password
```

---

## Step 2: Azure Configuration

### File: `config/azure.js`

This file stores your Azure Service Principal credentials for accessing Azure Container Registry.

### Why Service Principal?

A **Service Principal** is an app identity in Azure Active Directory. It's more secure than using your personal Azure credentials because:
- You can limit its permissions
- You can revoke it without affecting your account
- It's designed for automation

### How to Get Azure Credentials

You have two options:

#### Option A: Create a New Service Principal (Recommended)

**Prerequisites:**
- Azure CLI installed (`az` command available)
- An active Azure subscription

**Steps:**

1. **Open terminal/command prompt** and login to Azure:
   ```bash
   az login
   ```
   This opens a browser to authenticate. Complete the login.

2. **Get your subscription ID** (you'll need it):
   ```bash
   az account show --query id --output tsv
   ```
   Copy this ID (looks like: `00000000-0000-0000-0000-000000000000`)

3. **Create the service principal** (replace `<subscription-id>`):
   ```bash
   az ad sp create-for-rbac --name cloud-registry-builder \
     --role Contributor \
     --scopes /subscriptions/<subscription-id>
   ```

4. **Copy the output**, which looks like:
   ```json
   {
     "appId": "12345678-1234-1234-1234-123456789012",
     "displayName": "cloud-registry-builder",
     "password": "YOUR_AZURE_CLIENT_SECRET",
     "tenant": "YOUR_TENANT_ID"
   }
   ```

5. **Map values to config:**
   - `appId` → `AZURE_CLIENT_ID`
   - `password` → `AZURE_CLIENT_SECRET`
   - `tenant` → `AZURE_TENANT_ID`

#### Option B: Use Existing Service Principal

If a service principal already exists:

1. **List service principals:**
   ```bash
   az ad sp list --display-name "cloud-registry-builder" \
     --query "[].{id:appId}" --output tsv
   ```
   Copy the `id` (appId) as `AZURE_CLIENT_ID`

2. **Get tenant ID:**
   ```bash
   az account show --query tenantId --output tsv
   ```
   Use this as `AZURE_TENANT_ID`

3. **Get the secret:**
   - Go to Azure Portal → Azure Active Directory → App registrations
   - Find your app by appId
   - Secrets → Create new client secret
   - Copy value as `AZURE_CLIENT_SECRET`

### Update `config/azure.js`

Create or edit the file `config/azure.js`:

```javascript
const azureConfig = {
  AZURE_CLIENT_ID: "your-client-id-here",
  AZURE_TENANT_ID: "your-tenant-id-here",
  AZURE_CLIENT_SECRET: "your-client-secret-here"
};

module.exports = { azureConfig };
```

### Verification

**Test Azure credentials:**
```bash
# Login using service principal
az login --service-principal \
  -u AZURE_CLIENT_ID \
  -p AZURE_CLIENT_SECRET \
  --tenant AZURE_TENANT_ID

# List your container registries
az acr list --query "[].{name:name, resourceGroup:resourceGroup}" -o table
```

**Success indicators:**
- Login completes without errors
- You see your container registry(ies) listed

---

## Step 3: Verify Azure Container Registry (ACR)

Before running the app, ensure you have at least one Azure Container Registry.

### List Your Registries

```bash
az acr list --query "[].{name:name, loginServer:loginServer}" -o table
```

**Output example:**
```
Name        Login Server
----------  -----------
myregistry  myregistry.azurecr.io
prodregistry  prodregistry.azurecr.io
```

### Create a New Registry (if needed)

```bash
# Create resource group (if you don't have one)
az group create --name my-resource-group --location eastus

# Create container registry
az acr create --resource-group my-resource-group \
  --name myregistry --sku Basic
```

**Parameters:**
- `--name`: Registry name (3-50 alphanumeric characters, lowercase)
- `--sku`: Pricing tier (Basic, Standard, Premium)
  - `Basic` is cheapest (suitable for testing)

---

## Complete Configuration Checklist

Use this checklist to verify everything is configured:

### Bitbucket Setup

- [ ] Created Bitbucket App Password with "Repositories: read" permission
- [ ] Copied your Bitbucket username
- [ ] `config/git.js` exists and contains:
  - [ ] `BITBUCKET_USER: "[your-username]"`
  - [ ] `BITBUCKET_TOKEN: "[your-app-password]"`
- [ ] Tested git clone works with credentials

### Azure Setup

- [ ] Created or identified Azure Service Principal
- [ ] Retrieved and noted:
  - [ ] `AZURE_CLIENT_ID` (appId)
  - [ ] `AZURE_CLIENT_SECRET` (password)
  - [ ] `AZURE_TENANT_ID` (tenant)
- [ ] `config/azure.js` exists and contains all three values
- [ ] Tested `az login` works with service principal
- [ ] Verified at least one ACR exists via `az acr list`

### Ready to Run

- [ ] Both config files exist in `/config` folder
- [ ] npm dependencies installed (`npm install`)
- [ ] Docker installed
- [ ] Azure CLI installed
- [ ] Git installed

---

## File Structure

After configuration, your `/config` folder should look like:

```
config/
├── azure.js          ← Contains AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET
├── git.js            ← Contains BITBUCKET_USER, BITBUCKET_TOKEN
```

---

## Common Issues & Troubleshooting

### "Repository URL is required"
- Ensure Bitbucket URL is in format: `https://bitbucket.org/org/repo.git`
- Check `BITBUCKET_USER` and `BITBUCKET_TOKEN` in `config/git.js`

### "Invalid Bitbucket URL"
- URL must be from Bitbucket (bitbucket.org)
- Must include `.git` extension
- Format: `https://bitbucket.org/organization/repository.git`

### "Azure login failed"
- Run `az login` to test authentication
- Verify service principal credentials in `config/azure.js`
- Check that service principal has "Contributor" role

### "CLoud not find any registries"
- Run `az acr list` to verify registries exist
- Ensure service principal has access to them (role assignment)

### "Docker build failed"
- Ensure repository has `Dockerfile` at root
- Service principal needs ACR permissions

### Port 3000 already in use
- Linux/Mac: `lsof -i :3000` then `kill -9 <PID>`
- Windows: `netstat -ano | findstr :3000` then `taskkill /PID <PID> /F`
- Or edit `server.js` to use different PORT

### Service Principal Secret Expired
- Create new secret via Azure Portal
- Update `AZURE_CLIENT_SECRET` in `config/azure.js`
- Azure secrets expire after 2 years by default

---

## Security Best Practices

1. **Keep credentials private**
   - Never commit `config/git.js` or `config/azure.js` to git
   - Add `/config/*.js` to `.gitignore` if not already there

2. **Use separate credentials per environment**
   - Development: One service principal
   - Production: Different service principal with limited ACR access

3. **Rotate secrets regularly**
   - Bitbucket: Regenerate App Password every 6-12 months
   - Azure: Create new service principal secret yearly

4. **Monitor permissions**
   - Check Azure Portal for who can access the service principal
   - Review Bitbucket team permissions monthly

5. **Use strong passwords**
   - Don't manually create passwords
   - Use generated tokens/passwords

---

## Next Steps

Once configuration is complete:

1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open browser: `http://localhost:3000`
4. Test the application:
   - Enter a Bitbucket repo URL
   - Click "Get Branches"
   - Verify your registries appear in the dropdown
   - Try a test build

See the main [README.md](./README.md) for complete usage instructions.
