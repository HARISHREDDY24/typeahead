# Search Typeahead System
A search typeahead with distributed cache (consistent hashing), recency-aware trending, and batched writes.

## Setup (Step 1: dataset)
cd backend
npm install
npm run gen     # generate dataset/queries.csv
npm run load    # load into SQLite (typeahead.db)