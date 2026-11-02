-- AlterTable
ALTER TABLE "Application" ADD COLUMN "assessedFingerprint" TEXT;
ALTER TABLE "Application" ADD COLUMN "destinationHost" TEXT;
ALTER TABLE "Application" ADD COLUMN "invalidatedAt" DATETIME;

-- CreateTable
CREATE TABLE "DestinationFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retractsId" TEXT,
    "basis" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT,
    "sourceDataDate" TEXT,
    "evidenceFingerprint" TEXT,
    "includeSubdomains" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DestinationFinding_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issn" TEXT,
    "eissn" TEXT,
    "submittedUrl" TEXT,
    "authenticUrl" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'PRE_SUBMISSION',
    "pseudonym" TEXT,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "isFictionalFixture" BOOLEAN NOT NULL DEFAULT false,
    "applicationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_MANUAL_REFERENCE',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValidationReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "journalStatus" TEXT NOT NULL,
    "destinationStatus" TEXT NOT NULL,
    "adminStatus" TEXT NOT NULL,
    "finalStatus" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "uncertainty" TEXT,
    "assessorId" TEXT NOT NULL,
    "assessorName" TEXT NOT NULL,
    "assessedAt" DATETIME NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationReference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ValidationCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "runNo" INTEGER NOT NULL,
    "assessmentId" TEXT,
    "applicationId" TEXT,
    "policyVersion" INTEGER NOT NULL,
    "policyHash" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "applicationSnapshotJson" TEXT,
    "evidenceSnapshotJson" TEXT NOT NULL,
    "generatedJson" TEXT NOT NULL,
    "comparisonJson" TEXT NOT NULL,
    "agreement" TEXT NOT NULL,
    "safetyCritical" BOOLEAN NOT NULL DEFAULT false,
    "discrepancyClass" TEXT,
    "discrepancyNote" TEXT,
    "correctiveAction" TEXT,
    "retestOfRunId" TEXT,
    "retestOutcome" TEXT,
    "runById" TEXT NOT NULL,
    "runByName" TEXT NOT NULL,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classifiedById" TEXT,
    CONSTRAINT "ValidationRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ValidationCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValidationRun_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ValidationReference" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReferenceDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "sourceDate" DATETIME,
    "isComplete" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "rowCount" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validationJson" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_ReferenceDataset" ("active", "filename", "id", "importedAt", "importedById", "isComplete", "isDemo", "kind", "provenance", "rowCount", "sha256", "sourceDate", "versionLabel") SELECT "active", "filename", "id", "importedAt", "importedById", "isComplete", "isDemo", "kind", "provenance", "rowCount", "sha256", "sourceDate", "versionLabel" FROM "ReferenceDataset";
DROP TABLE "ReferenceDataset";
ALTER TABLE "new_ReferenceDataset" RENAME TO "ReferenceDataset";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DestinationFinding_journalId_host_idx" ON "DestinationFinding"("journalId", "host");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationCase_caseCode_key" ON "ValidationCase"("caseCode");
