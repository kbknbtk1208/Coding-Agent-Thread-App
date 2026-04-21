import React from 'react';
import Head from 'next/head';
import { GraphReviewPage } from '../features/poc3-graph-review/graph-review-page';

export default function Poc3GraphReviewRoute() {
  return (
    <React.Fragment>
      <Head>
        <title>PoC-3 Graph Review</title>
      </Head>
      <GraphReviewPage />
    </React.Fragment>
  );
}
