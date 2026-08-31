const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");

const ONE_YEAR = 365 * 24 * 60 * 60;

// Sentinel expiry meaning the certificate never expires.
const NEVER_EXPIRES = 0;

const CERT_ID = ethers.keccak256(ethers.toUtf8Bytes("CERT-2026-001"));
const DATA_HASH = ethers.keccak256(
  ethers.toUtf8Bytes("Ada Lovelace - BSc Computer Science - First Class")
);

describe("CertificateRegistry", function () {
  // Fresh deployment shared across tests via snapshot/restore, so time travel
  // in one test cannot leak into another.
  async function deployFixture() {
    const [owner, otherAccount, holder] = await ethers.getSigners();

    const CertificateRegistry =
      await ethers.getContractFactory("CertificateRegistry");
    const registry = await CertificateRegistry.deploy();
    await registry.waitForDeployment();

    const expiry = (await time.latest()) + ONE_YEAR;

    return { registry, owner, otherAccount, holder, expiry };
  }

  describe("Deployment", function () {
    it("sets the deployer as the owner", async function () {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe("Issuing", function () {
    it("stores every field of a newly issued certificate", async function () {
      const { registry, owner, expiry } = await loadFixture(deployFixture);

      const tx = await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);
      const issuedAt = await time.latest();

      const cert = await registry.certificates(CERT_ID);
      expect(cert.dataHash).to.equal(DATA_HASH);
      expect(cert.issuer).to.equal(owner.address);
      expect(cert.issueDate).to.equal(issuedAt);
      expect(cert.expiryTimestamp).to.equal(expiry);
      expect(cert.revoked).to.equal(false);
      expect(cert.exists).to.equal(true);

      await expect(tx)
        .to.emit(registry, "CertificateIssued")
        .withArgs(CERT_ID, DATA_HASH, owner.address, issuedAt, expiry);
    });

    it("rejects a duplicate certificate id", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      await expect(registry.issueCertificate(CERT_ID, DATA_HASH, expiry))
        .to.be.revertedWithCustomError(registry, "CertificateAlreadyExists")
        .withArgs(CERT_ID);
    });

    it("rejects a non-zero expiry that is not in the future", async function () {
      const { registry } = await loadFixture(deployFixture);
      const past = (await time.latest()) - 1;

      await expect(
        registry.issueCertificate(CERT_ID, DATA_HASH, past)
      ).to.be.revertedWithCustomError(registry, "InvalidExpiry");
    });

    it("accepts an expiry of 0, meaning never expires", async function () {
      const { registry, owner } = await loadFixture(deployFixture);

      const tx = await registry.issueCertificate(
        CERT_ID,
        DATA_HASH,
        NEVER_EXPIRES
      );
      const issuedAt = await time.latest();

      await expect(tx)
        .to.emit(registry, "CertificateIssued")
        .withArgs(CERT_ID, DATA_HASH, owner.address, issuedAt, NEVER_EXPIRES);

      expect((await registry.certificates(CERT_ID)).expiryTimestamp).to.equal(
        NEVER_EXPIRES
      );
    });

    it("rejects an empty id or data hash", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);

      await expect(
        registry.issueCertificate(ethers.ZeroHash, DATA_HASH, expiry)
      ).to.be.revertedWithCustomError(registry, "InvalidCertificateData");

      await expect(
        registry.issueCertificate(CERT_ID, ethers.ZeroHash, expiry)
      ).to.be.revertedWithCustomError(registry, "InvalidCertificateData");
    });
  });

  describe("Verifying", function () {
    it("reports a freshly issued certificate as Valid", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      const result = await registry.verifyCertificate(CERT_ID);
      expect(result.dataHash).to.equal(DATA_HASH);
      expect(result.expiryTimestamp).to.equal(expiry);
      expect(result.revoked).to.equal(false);
      expect(result.status).to.equal("Valid");
      expect(await registry.isValid(CERT_ID)).to.equal(true);
    });

    it("reports a certificate as Expired once its expiry has passed", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      // Jump the chain clock one second past the expiry.
      await time.increaseTo(expiry + 1);

      const result = await registry.verifyCertificate(CERT_ID);
      expect(result.status).to.equal("Expired");
      expect(result.revoked).to.equal(false); // expired, but never revoked
      expect(await registry.isValid(CERT_ID)).to.equal(false);
    });

    it("still reports Valid in the final second before expiry", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      await time.increaseTo(expiry);

      expect((await registry.verifyCertificate(CERT_ID)).status).to.equal(
        "Valid"
      );
    });

    it("reverts for a certificate that was never issued", async function () {
      const { registry } = await loadFixture(deployFixture);

      await expect(registry.verifyCertificate(CERT_ID))
        .to.be.revertedWithCustomError(registry, "CertificateNotFound")
        .withArgs(CERT_ID);
    });
  });

  describe("Revoking", function () {
    it("marks the certificate revoked and emits the event", async function () {
      const { registry, owner, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      const tx = await registry.revokeCertificate(CERT_ID);
      const revokedAt = await time.latest();

      await expect(tx)
        .to.emit(registry, "CertificateRevoked")
        .withArgs(CERT_ID, owner.address, revokedAt);

      const result = await registry.verifyCertificate(CERT_ID);
      expect(result.revoked).to.equal(true);
      expect(result.status).to.equal("Revoked");
      expect(await registry.isValid(CERT_ID)).to.equal(false);
    });

    it("reports Revoked even after the certificate has also expired", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);
      await registry.revokeCertificate(CERT_ID);

      await time.increaseTo(expiry + 1);

      // Revocation takes precedence over expiry.
      expect((await registry.verifyCertificate(CERT_ID)).status).to.equal(
        "Revoked"
      );
    });

    it("rejects revoking twice", async function () {
      const { registry, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);
      await registry.revokeCertificate(CERT_ID);

      await expect(registry.revokeCertificate(CERT_ID))
        .to.be.revertedWithCustomError(registry, "CertificateAlreadyRevoked")
        .withArgs(CERT_ID);
    });

    it("rejects revoking a certificate that was never issued", async function () {
      const { registry } = await loadFixture(deployFixture);

      await expect(registry.revokeCertificate(CERT_ID))
        .to.be.revertedWithCustomError(registry, "CertificateNotFound")
        .withArgs(CERT_ID);
    });
  });

  describe("Non-expiring certificates (expiry = 0)", function () {
    it("reports Valid immediately after issue", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, NEVER_EXPIRES);

      const result = await registry.verifyCertificate(CERT_ID);
      expect(result.expiryTimestamp).to.equal(NEVER_EXPIRES);
      expect(result.revoked).to.equal(false);
      expect(result.status).to.equal("Valid");
      expect(await registry.isValid(CERT_ID)).to.equal(true);
    });

    it("still reports Valid a century later", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, NEVER_EXPIRES);

      // Far past any plausible expiry: the expiry branch must be skipped.
      await time.increase(100 * ONE_YEAR);

      expect((await registry.verifyCertificate(CERT_ID)).status).to.equal(
        "Valid"
      );
      expect(await registry.isValid(CERT_ID)).to.equal(true);
    });

    it("can still be revoked, and then reports Revoked", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, NEVER_EXPIRES);

      await registry.revokeCertificate(CERT_ID);

      const result = await registry.verifyCertificate(CERT_ID);
      expect(result.revoked).to.equal(true);
      expect(result.status).to.equal("Revoked");
      expect(await registry.isValid(CERT_ID)).to.equal(false);
    });

    it("stays Revoked a century later", async function () {
      const { registry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, NEVER_EXPIRES);
      await registry.revokeCertificate(CERT_ID);

      await time.increase(100 * ONE_YEAR);

      expect((await registry.verifyCertificate(CERT_ID)).status).to.equal(
        "Revoked"
      );
    });
  });

  describe("Access control", function () {
    it("blocks a non-owner from issuing", async function () {
      const { registry, otherAccount, expiry } =
        await loadFixture(deployFixture);

      await expect(
        registry
          .connect(otherAccount)
          .issueCertificate(CERT_ID, DATA_HASH, expiry)
      )
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
        .withArgs(otherAccount.address);
    });

    it("blocks a non-owner from revoking", async function () {
      const { registry, otherAccount, expiry } =
        await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      await expect(registry.connect(otherAccount).revokeCertificate(CERT_ID))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
        .withArgs(otherAccount.address);
    });

    it("lets anyone verify a certificate", async function () {
      const { registry, holder, expiry } = await loadFixture(deployFixture);
      await registry.issueCertificate(CERT_ID, DATA_HASH, expiry);

      // A third party with no special role can still check validity.
      const result = await registry.connect(holder).verifyCertificate(CERT_ID);
      expect(result.status).to.equal("Valid");
    });

    it("lets ownership transfer to a new issuing organization", async function () {
      const { registry, otherAccount, expiry } =
        await loadFixture(deployFixture);

      await registry.transferOwnership(otherAccount.address);
      expect(await registry.owner()).to.equal(otherAccount.address);

      await expect(
        registry
          .connect(otherAccount)
          .issueCertificate(CERT_ID, DATA_HASH, expiry)
      ).to.emit(registry, "CertificateIssued");
    });
  });
});
