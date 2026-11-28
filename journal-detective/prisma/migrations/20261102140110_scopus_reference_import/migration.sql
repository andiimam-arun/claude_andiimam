-- CreateTable
CREATE TABLE "ScopusImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionLabel" TEXT NOT NULL,
    "observationDate" DATETIME NOT NULL,
    "sourceUrl" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,
    "importedByName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "stagedPath" TEXT,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" DATETIME,
    "supersededAt" DATETIME
);

-- CreateTable
CREATE TABLE "ScopusSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "normTitle" TEXT NOT NULL,
    "issnRaw" TEXT,
    "eissnRaw" TEXT,
    "issn" TEXT,
    "eissn" TEXT,
    "status" TEXT NOT NULL,
    "activeRaw" TEXT,
    "coverage" TEXT,
    "coverageFrom" INTEGER,
    "coverageTo" INTEGER,
    "discontinuedQuality" BOOLEAN NOT NULL DEFAULT false,
    "discontinuedRaw" TEXT,
    "sourceType" TEXT,
    "publisher" TEXT,
    "publisherGroup" TEXT,
    "publisherCountry" TEXT,
    "asjc" TEXT,
    "openAccessRaw" TEXT,
    "origin" TEXT NOT NULL,
    "discontinuedJson" TEXT,
    "acceptedJson" TEXT,
    "conflictsJson" TEXT NOT NULL DEFAULT '[]',
    "extraJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "ScopusSource_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ScopusImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScopusImport_status_isCurrent_idx" ON "ScopusImport"("status", "isCurrent");

-- CreateIndex
CREATE INDEX "ScopusSource_importId_sourceId_idx" ON "ScopusSource"("importId", "sourceId");

-- CreateIndex
CREATE INDEX "ScopusSource_importId_issn_idx" ON "ScopusSource"("importId", "issn");

-- CreateIndex
CREATE INDEX "ScopusSource_importId_eissn_idx" ON "ScopusSource"("importId", "eissn");

-- CreateIndex
CREATE INDEX "ScopusSource_importId_normTitle_idx" ON "ScopusSource"("importId", "normTitle");
