-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "studyProgram" TEXT,
    "studentNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "configJson" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "normTitle" TEXT NOT NULL,
    "altTitlesJson" TEXT NOT NULL DEFAULT '[]',
    "issn" TEXT,
    "eissn" TEXT,
    "scopusSourceId" TEXT,
    "publisher" TEXT,
    "country" TEXT,
    "officialWebsite" TEXT,
    "verifiedDomainsJson" TEXT NOT NULL DEFAULT '[]',
    "subjectsJson" TEXT NOT NULL DEFAULT '[]',
    "claimedIndexingJson" TEXT NOT NULL DEFAULT '[]',
    "knownWarningsJson" TEXT NOT NULL DEFAULT '[]',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "reassessFlag" BOOLEAN NOT NULL DEFAULT false,
    "reassessReason" TEXT,
    "reassessDueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "submittedUrl" TEXT,
    "submittedDomain" TEXT,
    "policyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "journalStatus" TEXT NOT NULL,
    "decisionJson" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "aiSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "origin" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceRef" TEXT,
    "retrievedAt" DATETIME NOT NULL,
    "sourceDataDate" TEXT,
    "extracted" TEXT NOT NULL DEFAULT '',
    "explanation" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "requiresHuman" BOOLEAN NOT NULL DEFAULT false,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL,
    "retracted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReferenceDataset" (
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
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ReferenceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normTitle" TEXT NOT NULL,
    "issn" TEXT,
    "eissn" TEXT,
    "sourceId" TEXT,
    "publisher" TEXT,
    "domain" TEXT,
    "url" TEXT,
    "status" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ReferenceRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refNumber" TEXT NOT NULL,
    "studentUserId" TEXT,
    "studentName" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "studyProgram" TEXT NOT NULL,
    "supervisor" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "manuscriptTitle" TEXT NOT NULL,
    "researchField" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "submissionDate" DATETIME,
    "trackingId" TEXT,
    "journalUrl" TEXT,
    "articleDoi" TEXT,
    "articleUrl" TEXT,
    "journalName" TEXT NOT NULL,
    "journalIssn" TEXT,
    "journalPublisher" TEXT,
    "claimedIndexing" TEXT,
    "claimedQuartile" TEXT,
    "journalId" TEXT,
    "assessmentId" TEXT,
    "workflow" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "recommendation" TEXT,
    "adminRejected" BOOLEAN NOT NULL DEFAULT false,
    "overrideJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "decidedAt" DATETIME,
    CONSTRAINT "Application_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedText" TEXT,
    "extractionNote" TEXT,
    "fieldsJson" TEXT NOT NULL DEFAULT '{}',
    "fieldsReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManuscriptEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "note" TEXT,
    "documentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManuscriptEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "reviewedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChecklistItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencyFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "documentId" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "resolvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsistencyFlag_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewAction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "officialNumber" TEXT,
    "verifyToken" TEXT NOT NULL,
    "approverId" TEXT,
    "approverName" TEXT,
    "approverTitle" TEXT,
    "approvedAt" DATETIME,
    "snapshotJson" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Letter_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "policyVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_version_key" ON "Policy"("version");

-- CreateIndex
CREATE INDEX "Journal_issn_idx" ON "Journal"("issn");

-- CreateIndex
CREATE INDEX "Journal_eissn_idx" ON "Journal"("eissn");

-- CreateIndex
CREATE INDEX "Journal_scopusSourceId_idx" ON "Journal"("scopusSourceId");

-- CreateIndex
CREATE INDEX "Journal_normTitle_idx" ON "Journal"("normTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_refNumber_key" ON "Assessment"("refNumber");

-- CreateIndex
CREATE INDEX "Assessment_journalId_idx" ON "Assessment"("journalId");

-- CreateIndex
CREATE INDEX "Evidence_journalId_idx" ON "Evidence"("journalId");

-- CreateIndex
CREATE INDEX "Evidence_assessmentId_idx" ON "Evidence"("assessmentId");

-- CreateIndex
CREATE INDEX "EvidenceReview_journalId_fingerprint_idx" ON "EvidenceReview"("journalId", "fingerprint");

-- CreateIndex
CREATE INDEX "ReferenceRecord_datasetId_idx" ON "ReferenceRecord"("datasetId");

-- CreateIndex
CREATE INDEX "ReferenceRecord_issn_idx" ON "ReferenceRecord"("issn");

-- CreateIndex
CREATE INDEX "ReferenceRecord_eissn_idx" ON "ReferenceRecord"("eissn");

-- CreateIndex
CREATE INDEX "ReferenceRecord_sourceId_idx" ON "ReferenceRecord"("sourceId");

-- CreateIndex
CREATE INDEX "ReferenceRecord_normTitle_idx" ON "ReferenceRecord"("normTitle");

-- CreateIndex
CREATE INDEX "ReferenceRecord_domain_idx" ON "ReferenceRecord"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Application_refNumber_key" ON "Application"("refNumber");

-- CreateIndex
CREATE INDEX "Application_workflow_idx" ON "Application"("workflow");

-- CreateIndex
CREATE INDEX "Application_studentUserId_idx" ON "Application"("studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_applicationId_docType_key" ON "ChecklistItem"("applicationId", "docType");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_verifyToken_key" ON "Letter"("verifyToken");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
