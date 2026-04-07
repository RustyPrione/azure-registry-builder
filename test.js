const axios = require("axios");
const { exec } = require("child_process");

function getToken() {
  return new Promise((resolve, reject) => {
    exec(
      "az account get-access-token --resource https://containerregistry.azure.net --query accessToken -o tsv",
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      }
    );
  });
}

async function getRepositories(registry) {

  const token = await getToken();
  console.log({token})

  const response = await axios.get(
    `https://${registry}.azurecr.io/v2/_catalog`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data.repositories;
}

console.log(getRepositories("phtnaiaks"))