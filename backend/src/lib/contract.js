const { ethers } = require("ethers");

const { SEPOLIA_RPC_URL, PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;

// Minimal human-readable ABI - only what the backend actually calls, so the
// backend does not depend on the Hardhat artifacts in ../../contracts.
const CERTIFICATE_REGISTRY_ABI = [
  "function issueCertificate(bytes32 certificateId, bytes32 dataHash, uint256 expiryTimestamp) external",
  "function revokeCertificate(bytes32 certificateId) external",
  "function verifyCertificate(bytes32 certificateId) view returns (bytes32 dataHash, uint256 issueDate, uint256 expiryTimestamp, bool revoked, string status)",
  "function isValid(bytes32 certificateId) view returns (bool)",
  "function owner() view returns (address)",
  "event CertificateIssued(bytes32 indexed certificateId, bytes32 dataHash, address indexed issuer, uint256 issueDate, uint256 expiryTimestamp)",
];

let cached = null;

/**
 * Lazily builds the provider/wallet/contract trio.
 * Throws a clear error if blockchain env vars are missing, rather than
 * failing deep inside ethers at request time.
 */
function getContract() {
  if (cached) return cached;

  const missing = [];
  if (!SEPOLIA_RPC_URL) missing.push("SEPOLIA_RPC_URL");
  if (!PRIVATE_KEY) missing.push("PRIVATE_KEY");
  if (!CONTRACT_ADDRESS) missing.push("CONTRACT_ADDRESS");
  if (missing.length) {
    throw new Error(`Blockchain config missing from .env: ${missing.join(", ")}`);
  }

  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  // The contract stores keys 0x-prefixed; .env may hold the bare hex.
  const key = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CERTIFICATE_REGISTRY_ABI, wallet);

  cached = { provider, wallet, contract };
  return cached;
}

/** Converts the human-readable id ("CERT-2026-AB12CD") to the on-chain bytes32. */
function toBytes32Id(certificateId) {
  return ethers.keccak256(ethers.toUtf8Bytes(certificateId));
}

/**
 * Canonical hash of the certificate's core data. The field order here is part
 * of the contract with verifiers - changing it invalidates every prior hash.
 */
function computeDataHash({ recipientName, courseName, issueDate, expiryDate }) {
  const canonical = JSON.stringify({
    recipientName,
    courseName,
    issueDate: new Date(issueDate).toISOString(),
    expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
  });
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

module.exports = {
  CERTIFICATE_REGISTRY_ABI,
  getContract,
  toBytes32Id,
  computeDataHash,
};
