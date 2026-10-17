-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionWeek" INTEGER NOT NULL,
    "sessionDay" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL,
    "remappingJson" TEXT,
    "status" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importBatchId" TEXT,
    "week" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 1,
    "checkpoint" TEXT NOT NULL,
    "studiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedWord" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "ipa" TEXT,
    "audioUrl" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "audioUpdatedAt" DATETIME,
    "audioAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "WordMeaning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordId" TEXT NOT NULL,
    "meaningVi" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "WordMeaning_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sentence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "targetForm" TEXT,
    "translationVi" TEXT NOT NULL,
    "audioUrl" TEXT,
    "audioStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "audioUpdatedAt" DATETIME,
    "audioAttempts" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Sentence_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrong" TEXT NOT NULL,
    "correct" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "explanationVi" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "dueDate" TEXT NOT NULL,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewStateId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "intervalBefore" INTEGER NOT NULL,
    "intervalAfter" INTEGER NOT NULL,
    "easeFactorBefore" REAL NOT NULL,
    "easeFactorAfter" REAL NOT NULL,
    "reviewDurationMs" INTEGER NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewLog_reviewStateId_fkey" FOREIGN KEY ("reviewStateId") REFERENCES "ReviewState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionDate" TEXT NOT NULL,
    "queueJson" TEXT NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StudyQuotaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxNewWordsPerDay" INTEGER NOT NULL DEFAULT 10,
    "maxNewMistakesPerDay" INTEGER NOT NULL DEFAULT 5,
    "maxReviewWordsPerDay" INTEGER NOT NULL DEFAULT 50,
    "maxReviewMistakesPerDay" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_contentHash_key" ON "ImportBatch"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Session_week_day_seq_key" ON "Session"("week", "day", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "SessionItem_sessionId_itemType_itemId_key" ON "SessionItem"("sessionId", "itemType", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Word_normalizedWord_pos_key" ON "Word"("normalizedWord", "pos");

-- CreateIndex
CREATE UNIQUE INDEX "Sentence_wordId_contentHash_key" ON "Sentence"("wordId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_contentHash_key" ON "Mistake"("contentHash");

-- CreateIndex
CREATE INDEX "ReviewState_itemType_dueDate_idx" ON "ReviewState"("itemType", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_itemType_itemId_key" ON "ReviewState"("itemType", "itemId");
