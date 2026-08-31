// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CertificateRegistry
 * @notice On-chain registry of digital certificates for a single issuing
 *         organization. The contract stores only a hash of each certificate's
 *         contents (`dataHash`), never the underlying personal data, so the
 *         registry can be public while the certificate itself stays private.
 *
 * @dev Verification model: a holder presents their certificate document plus
 *      its `certificateId`. A verifier hashes the document off-chain and
 *      compares that hash against the `dataHash` returned by
 *      {verifyCertificate}. A match proves the document is byte-for-byte what
 *      the issuer signed; the returned status proves it is still in force.
 */
contract CertificateRegistry is Ownable {
    /// @notice A single issued certificate.
    struct Certificate {
        bytes32 dataHash; // keccak256 of the off-chain certificate document
        address issuer; // address that issued it (the owner at issue time)
        uint256 issueDate; // block timestamp when it was issued
        uint256 expiryTimestamp; // moment it stops being valid; 0 = never expires
        bool revoked; // true once explicitly revoked by the owner
        bool exists; // guards against reading an unissued slot
    }

    /// @notice All issued certificates, keyed by their unique id.
    /// @dev Public, so Solidity generates a getter exposing every field
    ///      (including `issuer`, which {verifyCertificate} omits).
    mapping(bytes32 => Certificate) public certificates;

    /// @notice Emitted once when a certificate is first recorded.
    event CertificateIssued(
        bytes32 indexed certificateId,
        bytes32 dataHash,
        address indexed issuer,
        uint256 issueDate,
        uint256 expiryTimestamp
    );

    /// @notice Emitted once when a certificate is revoked.
    event CertificateRevoked(
        bytes32 indexed certificateId,
        address indexed revokedBy,
        uint256 revokedAt
    );

    /// @notice Thrown when issuing an id that has already been used.
    error CertificateAlreadyExists(bytes32 certificateId);
    /// @notice Thrown when reading or revoking an id that was never issued.
    error CertificateNotFound(bytes32 certificateId);
    /// @notice Thrown when revoking a certificate that is already revoked.
    error CertificateAlreadyRevoked(bytes32 certificateId);
    /// @notice Thrown when the id or data hash is left empty.
    error InvalidCertificateData();
    /// @notice Thrown when a non-zero expiry is not in the future at issue time.
    /// @dev An expiry of 0 is always accepted and means "never expires".
    error InvalidExpiry(uint256 expiryTimestamp, uint256 currentTime);

    /// @dev Deployer becomes the issuing organization. Ownership is
    ///      transferable via OpenZeppelin's `transferOwnership`.
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Record a new certificate on-chain. Owner only.
     * @param certificateId Unique id for this certificate. Use a hash of your
     *        internal reference (e.g. `keccak256("CERT-2026-001")`) so the id
     *        itself leaks nothing.
     * @param dataHash keccak256 of the certificate document.
     * @param expiryTimestamp Unix time at which the certificate expires; must
     *        be in the future. Pass 0 for a certificate that never expires.
     *
     * @dev Ids are write-once: re-issuing an existing id reverts rather than
     *      silently overwriting, so a certificate's history cannot be rewritten.
     */
    function issueCertificate(
        bytes32 certificateId,
        bytes32 dataHash,
        uint256 expiryTimestamp
    ) external onlyOwner {
        if (certificateId == bytes32(0) || dataHash == bytes32(0)) {
            revert InvalidCertificateData();
        }
        if (certificates[certificateId].exists) {
            revert CertificateAlreadyExists(certificateId);
        }
        // 0 is the sentinel for "never expires"; any other value must be future-dated.
        if (expiryTimestamp != 0 && expiryTimestamp <= block.timestamp) {
            revert InvalidExpiry(expiryTimestamp, block.timestamp);
        }

        certificates[certificateId] = Certificate({
            dataHash: dataHash,
            issuer: msg.sender,
            issueDate: block.timestamp,
            expiryTimestamp: expiryTimestamp,
            revoked: false,
            exists: true
        });

        emit CertificateIssued(
            certificateId,
            dataHash,
            msg.sender,
            block.timestamp,
            expiryTimestamp
        );
    }

    /**
     * @notice Permanently revoke a certificate. Owner only.
     * @param certificateId The certificate to revoke.
     *
     * @dev Revocation is one-way and takes precedence over expiry: a revoked
     *      certificate reports "Revoked" whether or not it has also expired.
     */
    function revokeCertificate(bytes32 certificateId) external onlyOwner {
        Certificate storage cert = certificates[certificateId];

        if (!cert.exists) revert CertificateNotFound(certificateId);
        if (cert.revoked) revert CertificateAlreadyRevoked(certificateId);

        cert.revoked = true;

        emit CertificateRevoked(certificateId, msg.sender, block.timestamp);
    }

    /**
     * @notice Look up a certificate and its current status. Callable by anyone.
     * @param certificateId The certificate to check.
     * @return dataHash Hash of the certificate document, to compare against a
     *         hash of the document being presented.
     * @return issueDate When it was issued.
     * @return expiryTimestamp When it expires, or 0 if it never expires.
     * @return revoked Whether it has been revoked.
     * @return status "Revoked", "Expired", or "Valid" — evaluated in that
     *         order of precedence against the current block timestamp.
     *
     * @dev Reverts for unknown ids rather than returning zeroed data, so a
     *      caller can never mistake a nonexistent certificate for a real one.
     */
    function verifyCertificate(
        bytes32 certificateId
    )
        external
        view
        returns (
            bytes32 dataHash,
            uint256 issueDate,
            uint256 expiryTimestamp,
            bool revoked,
            string memory status
        )
    {
        Certificate storage cert = certificates[certificateId];
        if (!cert.exists) revert CertificateNotFound(certificateId);

        // Revocation is checked first: it overrides expiry.
        if (cert.revoked) {
            status = "Revoked";
        } else if (
            cert.expiryTimestamp != 0 && block.timestamp > cert.expiryTimestamp
        ) {
            // Skipped entirely for non-expiring (0) certificates.
            status = "Expired";
        } else {
            status = "Valid";
        }

        return (
            cert.dataHash,
            cert.issueDate,
            cert.expiryTimestamp,
            cert.revoked,
            status
        );
    }

    /**
     * @notice Convenience check for callers that only need a yes/no answer.
     * @return True only if the certificate exists, is unrevoked, and is unexpired.
     *         A certificate with an expiry of 0 never expires.
     */
    function isValid(bytes32 certificateId) external view returns (bool) {
        Certificate storage cert = certificates[certificateId];
        return
            cert.exists &&
            !cert.revoked &&
            (cert.expiryTimestamp == 0 ||
                block.timestamp <= cert.expiryTimestamp);
    }
}
