const { exec } = require("child_process");
const { azureConfig } = require("../config/azure");

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function getRegistries() {

  await azureLogin();
  const output = await runCommand(
    `az acr list --query "[].name" -o tsv`
  );
  // console.log({output})
  const registries = output
    .split("\n")
    .map(r => r.trim())
    .filter(Boolean);

  console.log("Registries are fetched successfully");

  return registries;
}

async function getRepositories(registryName) {

  await azureLogin();
  const output = await runCommand(
    `az acr repository list --name ${registryName} -o tsv`
  );

  const repos = output
    .split("\n")
    .map(r => r.trim())
    .filter(Boolean);

  console.log("Repositories are fetched for the registry: ", registryName);

  return repos;
}

let loggedIn = false;

async function azureLogin() {

  if (loggedIn) return;

  console.log("Logging into Azure using Service Principal...");

  await runCommand(
    `az login --service-principal \
    --username ${azureConfig.AZURE_CLIENT_ID} \
    --password ${azureConfig.AZURE_CLIENT_SECRET} \
    --tenant ${azureConfig.AZURE_TENANT_ID}`
  );

  loggedIn = true;

}


module.exports = {
  getRegistries,
  getRepositories,
  azureLogin 
};


// az login --service-principal --username "54ada16e-6c3a-4d67-97ad-e1aa199872e5" --password "YOUR_AZURE_CLIENT_SECRET" --tenant "10150caf-d881-43f8-80c3-86ed2db4e05c"