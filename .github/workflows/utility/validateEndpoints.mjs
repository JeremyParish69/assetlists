/*
 * Purpose:
 *  to validate chain endpoints
 *  
 *  
 * Plan:
 *  when given a chain and rpc+rest,
 *  validate that our frontend will be able to connect
 *  and receive a valid respoind from thier endpoint
 *  RPC, WSS, REST
 * 
 * 
 */

//-- Imports --

import * as zone from "./assetlist_functions.mjs";
import * as chain_reg from "../../../chain-registry/.github/workflows/utility/chain_registry.mjs";
chain_reg.setup();
import * as path from 'path';
import * as api_mgmt from "./api_management.mjs";

import WebSocket from 'ws';
import https from 'https';

//-- Globals --

const chainlistFileName = "chainlist.json";
const chainlistDirName = "frontend";
const chainlistDir = path.join(zone.generatedDirectoryName, chainlistDirName);

const stateFileName = "state.json";
const stateDirName = "state";
const stateDir = path.join(zone.generatedDirectoryName, stateDirName);

//NODES
const RPC_NODE = "rpc";
const REST_NODE = "rest";

//PROTOCOLS
const HTTPS_PROTOCOL = "https:"
const WSS_PROTOCOL = "wss:"

//TESTS
const RPC_CORS = "RPC CORS";
const REST_CORS = "REST CORS";
const RPC_WSS = "RPC WSS";
const RPC_ENDPOINTS = "RPC Endpoints";
const REST_ENDPOINTS = "REST Endpoints";

//ENDPOINTS
const rpcEndpoints = [
  "status"
];
const wssEndpoints = [
  "websocket"
];
const restEndpoints = [
  "/cosmos/base/tendermint/v1beta1/node_info"
];


const numChainsToQuery = 2;
const currentDateUTC = new Date();
const oneDayInMs = 24 * 60 * 60 * 1000;
const successReQueryDelay = 7 * oneDayInMs;
const failureReQueryDelay = 30 * oneDayInMs;
const osmosisDomain = "https://osmosis.zone";

//-- Functions --

function constructUrl(baseUrl, endpoint, protocol = HTTPS_PROTOCOL) {
  if (!baseUrl || !endpoint) {
    console.error("Invalid baseUrl or endpoint:", { baseUrl, endpoint });
    return null;
  }
  try {
    const url = new URL(baseUrl);
    url.protocol = protocol;
    // Append the endpoint to the path
    const joinedPath = [url.pathname.replace(/\/$/, ""), endpoint.replace(/^\//, "")]
      .filter(Boolean) // Remove empty components
      .join("/");
    url.pathname = joinedPath;
    return url;
  } catch (error) {
    console.error("Failed to construct URL:", error.message);
    return null;
  }
}

function queryUrl(url, protocol = HTTPS_PROTOCOL) {
  if (!url) { return; }
  console.log(url.toString());
  if (protocol === HTTPS_PROTOCOL) {
    return api_mgmt.queryApi(url.toString());
  } else if (protocol === WSS_PROTOCOL) {
    return testWSS(url);
  }
}

const queryWSS = (url, timeoutMs = 10000) => {
  return new Promise((resolve) => {
    let timeout;

    try {
      const ws = new WebSocket(url.toString());
      const result = {
        success: false,
        headers: {},
        errorCode: null,
        message: null,
      };

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve({
          ...result,
          success: true,
          message: 'Connection successful',
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          ...result,
          errorCode: err.code || 'WS_ERROR',
          message: err.message || 'WebSocket error occurred',
        });
      });

      timeout = setTimeout(() => {
        ws.close();
        resolve({
          ...result,
          errorCode: 'TIMEOUT',
          message: 'Connection timed out',
        });
      }, timeoutMs);
    } catch (err) {
      resolve({
        success: false,
        headers: {},
        errorCode: 'UNEXPECTED_ERROR',
        message: err.message || 'Unexpected error occurred',
      });
    }
  });
};

const queryCORSOld = (url) => {
  const options = {
    method: 'OPTIONS',
    headers: {
      Origin: osmosisDomain,
    },
  };

  return new Promise((resolve) => {
    let timeout; // Reference for the timeout

    const req = https.request(url, options, (res) => {
      clearTimeout(timeout); // Clear timeout on response
      const result = {
        success: true,
        errorCode: res.statusCode, // Use res.statusCode here for successful response
        headers: res.headers,
        message: `CORS Policy: ${res.headers['access-control-allow-origin']}`,
        corsPolicy: res.headers['access-control-allow-origin'] || null,
      };

      resolve(result);
    });

    req.on('error', (err) => {
      clearTimeout(timeout); // Clear timeout on error
      console.error(`Error connecting to ${url.toString()}:`, err.message);
      resolve({
        success: false,
        errorCode: null, // No statusCode available in error case
        headers: null,
        message: err.message,
        corsPolicy: null,
      });
    });

    // Set timeout and handle its behavior
    timeout = setTimeout(() => {
      console.error(`Request to ${url.toString()} for CORS timed out.`);
      req.destroy(); // Clean up the request
      resolve({
        success: false,
        errorCode: null, // No statusCode available in timeout case
        headers: null,
        message: "Request timed out",
        corsPolicy: null,
      });
    }, 5000); // Timeout after 5 seconds

    req.end(); // End the request
  });
};

      

const queryCORS = (url) => {
  const options = {
    method: 'OPTIONS',
    headers: { Origin: osmosisDomain },
  };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(`Request to ${url} timed out.`);
      resolve({ success: false, errorCode: 'TIMEOUT', corsPolicy: null });
    }, 5000);

    const req = https.request(url, options, (res) => {
      clearTimeout(timeout);

      let body = '';
      res.on('data', chunk => body += chunk); // Collect chunks
      res.on('end', () => {
        resolve({
          success: true,
          errorCode: res.statusCode,
          headers: res.headers,
          message: `CORS Policy: ${res.headers['access-control-allow-origin']}`,
          corsPolicy: res.headers['access-control-allow-origin'] || null,
        });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`Error connecting to ${url}:`, err.message);
      resolve({ success: false, errorCode: err.code || 'UNKNOWN', corsPolicy: null });
    });

    req.end();
  });
};




const queryREST = (url) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`Request to ${url} timed out.`);
      resolve({ success: false, errorCode: null, message: "Request timed out" });
    }, 5000);

    let body = '';

    const req = https.request(url, { method: 'GET' }, (res) => {
      clearTimeout(timeout); // Clear timeout on response

      res.on('data', (chunk) => {
        body += chunk; // Accumulate the response body
      });

      res.on('end', () => {
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          errorCode: res.statusCode,
          headers: res.headers,
          message: res.statusCode >= 200 && res.statusCode < 300
            ? "Request succeeded"
            : `Invalid response: ${res.statusCode}`,
          body, // Attach the complete response body
        });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout); // Clear timeout on error
      resolve({
        success: false,
        errorCode: null,
        headers: null,
        message: err.message,
        body: null,
      });
    });

    req.end();
  });
};

const queryHTTP = (url) => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.error(`Request to ${url} timed out.`);
      resolve({ success: false, errorCode: null, message: "Request timed out" });
    }, 5000);

    let body = '';

    const req = https.request(url, { method: 'GET' }, (res) => {
      clearTimeout(timeout); // Clear timeout on response

      res.on('data', (chunk) => {
        body += chunk; // Accumulate the response body
      });

      res.on('end', () => {
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          errorCode: res.statusCode,
          headers: res.headers,
          message: res.statusCode >= 200 && res.statusCode < 300
            ? "Request succeeded"
            : `Invalid response: ${res.statusCode}`,
          body, // Attach the complete response body
        });
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout); // Clear timeout on error
      resolve({
        success: false,
        errorCode: null,
        headers: null,
        message: err.message,
        body: null,
      });
    });

    req.end();
  });
};

const logResult = (url, result, success) => {
  const status = result.success ? "SUCCESS" : `ERROR: ${result.errorCode || "UNKNOWN"}`;
  const message = `${result.errorCode || ""}: ${result.message || "No additional information"}`;
  console.log(`[${status}] ${url.toString()} - ${message}`);
  console.log(`Compatible?: ${success}`);
};

const evaluateWSSResult = (result) => {
  return result.success || false;
};

const testWSS = async (url) => {
  const result = await queryWSS(url);
  console.log("Testing WSS");
  const success = evaluateWSSResult(result);
  logResult(url, result, success);
  return success;
};

const evaluateCORSResult = (result) => {
  return result.corsPolicy === osmosisDomain || result.corsPolicy === "*";
};

const testCORS = async (url) => {
  const result = await queryCORS(url);
  console.log("Testing CORS");
  const success = evaluateCORSResult(result);
  logResult(url, result, success);
  return success;
};

const evaluateRESTResult = (result) => {
  return result.success || false;
};

const testREST = async (url) => {
  const result = await queryREST(url, { method: 'GET' });
  console.log("Testing REST");
  const success = evaluateRESTResult(result);
  logResult(url, result, success);
  return success;
};

const evaluateRPCResult = (result) => {
  return result.success || false;
};

const testRPC = async (url) => {
  const result = await queryHTTP(url, { method: 'GET' });
  console.log("Testing RPC");
  const success = evaluateRPCResult(result);
  logResult(url, result, success);
  return result;
};


function getChainlist(chainName) {
  return zone.readFromFile(chainName, chainlistDir, chainlistFileName);
}

function getCounterpartyChainAddress(counterpartyChain, nodeType) {
  if (!counterpartyChain || !nodeType) { return; }
  if (nodeType === RPC_NODE) {
    return counterpartyChain?.apis?.rpc?.[0]?.address;
  } else if (nodeType === REST_NODE) {
    return counterpartyChain?.apis?.rest?.[0]?.address;
  }
  return;
}


async function validateCounterpartyChain(counterpartyChain) {

  //--RPC CORS--
  const rpcCorsValidation = (async () => {
    const url = getCounterpartyChainAddress(counterpartyChain, RPC_NODE);
    if (!url) return [];
    return Promise.all([
      (async () => {
        const CORS_RESULT = await testCORS(url);
        return {
          test: RPC_CORS,
          url: url,
          success: CORS_RESULT,
        };
      })(),
    ]);
  })();
  //--

  //--RPC WSS--
  const rpcWssValidation = (async () => {
    const url = getCounterpartyChainAddress(counterpartyChain, RPC_NODE);
    if (!url) return [];
    return Promise.all(
      wssEndpoints.map(async (endpoint) => {
        const constructedUrl = constructUrl(url, endpoint, WSS_PROTOCOL);
        const response = await testWSS(constructedUrl);
        return {
          test: RPC_WSS,
          url: constructedUrl,
          success: response,
        };
      })
    );
  })();
  //--

  //--RPC Endpoints--
  const rpcEndpointsValidation = (async () => {
    const url = getCounterpartyChainAddress(counterpartyChain, RPC_NODE);
    if (!url) return [];
    return Promise.all(
      rpcEndpoints.map(async (endpoint) => {
        const constructedUrl = constructUrl(url, endpoint, HTTPS_PROTOCOL);
        const RPC_RESULT = await testRPC(constructedUrl);
        const result = {
          test: RPC_ENDPOINTS,
          url: constructedUrl,
          success: RPC_RESULT.success,
        };
        if (endpoint === "status") {
          const latestBlockTime = new Date(RPC_RESULT?.sync_info?.latest_block_time);
          const lenientDateUTC = new Date(currentDateUTC - 60 * 60 * 1000);
          result.stale = latestBlockTime < lenientDateUTC;
        }
        return result;
      })
    );
  })();
  //--

  //--REST CORS--
  const restCorsValidation = (async () => {
    const url = getCounterpartyChainAddress(counterpartyChain, REST_NODE);
    if (!url) return [];
    return Promise.all([
      (async () => {
        const CORS_RESULT = await testCORS(url);
        return {
          test: REST_CORS,
          url: url,
          success: CORS_RESULT,
        };
      })(),
    ]);
  })();
  //--

  //--REST Endpoints--
  const restEndpointsValidation = (async () => {
    const url = getCounterpartyChainAddress(counterpartyChain, REST_NODE);
    if (!url) return [];
    return Promise.all(
      restEndpoints.map(async (endpoint) => {
        const constructedUrl = constructUrl(url, endpoint, HTTPS_PROTOCOL);
        const REST_RESULT = await testREST(url);
        return {
          test: REST_ENDPOINTS,
          url: constructedUrl,
          success: REST_RESULT,
        };
      })
    );
  })();
  //--

  // Run all validations concurrently and merge results
  const [rpcCorsResults, rpcWssResults, rpcEndpointResults, restCorsResults, restEndpointsResults] = await Promise.all([
    rpcCorsValidation,
    rpcWssValidation,
    rpcEndpointsValidation,
    restCorsValidation,
    restEndpointsValidation,
  ]);

  return [...rpcCorsResults, ...rpcWssResults, ...rpcEndpointResults, ...restCorsResults, ...restEndpointsResults];
}


function determineValidationSuccess(validationResults) {
  for (const validationResult of validationResults) {
    if (!validationResult.success) { return false; }
    if (validationResults.stale) { return false; }
  }
  return true;
}

function constructValidationRecord(counterpartyChainName, validationResults) {
  return {
    chain_name: counterpartyChainName,
    validationDate: currentDateUTC,
    validationSuccess: determineValidationSuccess(validationResults),
    validationResults: validationResults
  };
}

function addValidationRecordsToState(state, chainName, validationRecords) {

  
  getState(chainName);

  if (!state.chains) { state.chains = []; }
  validationRecords.forEach((validationRecord) => {
    const index = state.chains.findIndex(chain => chain.chain_name === validationRecord.chain_name);
    if (index !== -1) {
      state.chains[index] = validationRecord;
    } else {
      state.chains.push(validationRecord);
    }
  });
  zone.writeToFile(chainName, stateDir, stateFileName, state);
  console.log("Saved State.");

}

function getState(chainName) {

  let state = {};
  try {
    state = zone.readFromFile(chainName, stateDir, stateFileName);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`File not found: ${error.message}`);
      state = {}; // Assign empty object if file doesn't exist
    } else {
      throw error; // Re-throw for unexpected errors
    }
  }
  return state;

}

function chainRecentlyQueried(state, chain_name) {
  const stateChain = state.chains?.find(chain => chain.chain_name === chain_name);
  if (stateChain) {
    const validationDate = new Date(stateChain.validationDate);
    if (!isNaN(validationDate.getTime())) {
      const WAS_SUCCESSFUL = stateChain.validationSuccess;
      if (WAS_SUCCESSFUL) {
        return currentDateUTC.getTime() - validationDate.getTime() <= successReQueryDelay;
      } else {
        return currentDateUTC.getTime() - validationDate.getTime() <= failureReQueryDelay;
      }
    }
  }
  return false;
}

async function validateEndpointsForAllCounterpartyChains(chainName) {

  if (chainName !== "osmosis") { return; } // temporary--just focusing on mainnet for now
  const chainlist = getChainlist(chainName)?.chains;
  if (!chainlist) { return; }

  let state = getState(chainName);
  let chainQueryQueue = [];

  let numChainsQueried = 0;
  for (const counterpartyChain of chainlist) {
    if (numChainsQueried >= numChainsToQuery) { break; }
    if (chainRecentlyQueried(state, counterpartyChain.chain_name)) { continue; }  //Skip Recently Queried Chains
    chainQueryQueue.push(counterpartyChain);
    numChainsQueried++;
  }

  // Generate validation promises and return records directly
  const validationPromises = chainQueryQueue.map(async (counterpartyChain) => {
    const validationResults = await validateCounterpartyChain(counterpartyChain);
    return constructValidationRecord(counterpartyChain.chain_name, validationResults);
  });

  // Wait for all validations and collect the records
  const validationRecords = await Promise.all(validationPromises);

  // Add validation records to state
  addValidationRecordsToState(state, chainName, validationRecords);

}

function main() {
  zone.chainNames.forEach(chainName => validateEndpointsForAllCounterpartyChains(chainName));
}

async function validateSpecificChain(chainName, chain_name) {

  const chainlist = getChainlist(chainName)?.chains;
  if (!chainlist) { return; }

  let state = getState(chainName);
  let chainQueryQueue = [];

  for (const counterpartyChain of chainlist) {
    if (counterpartyChain.chain_name !== chain_name) { continue; }
    chainQueryQueue.push(counterpartyChain);
    break;
  }

  // Generate validation promises and return records directly
  const validationPromises = chainQueryQueue.map(async (counterpartyChain) => {
    const validationResults = await validateCounterpartyChain(counterpartyChain);
    return constructValidationRecord(counterpartyChain.chain_name, validationResults);
  });

  // Wait for all validations and collect the records
  const validationRecords = await Promise.all(validationPromises);

  // Add validation records to state
  addValidationRecordsToState(state, chainName, validationRecords);

}

//main();
validateSpecificChain("osmosis", "kujira");