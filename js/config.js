// DÙN RIGHT - MSAL Authentication Configuration
// Azure Entra ID App Registration credentials

const msalConfig = {
  auth: {
    clientId: "50574788-003e-4ed6-b45a-ee8ae3f47e4a",
    authority: "https://login.microsoftonline.com/bea4d4e4-62b3-47c2-9060-e5171dfe3914",
    redirectUri: "https://witty-plant-05789e010.7.azurestaticapps.net",
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: [
    "User.Read",
    "Files.ReadWrite",
    "Mail.Send",
    "Calendars.ReadWrite",
  ],
};

const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
  graphDriveEndpoint: "https://graph.microsoft.com/v1.0/me/drive",
};
