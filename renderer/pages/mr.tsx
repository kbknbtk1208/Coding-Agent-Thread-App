import React from 'react';
import Head from 'next/head';
import { ReviewPage } from '../features/review/review-page';

export default function MrPage() {
  return (
    <React.Fragment>
      <Head>
        <title>Merge Request Review</title>
      </Head>
      <ReviewPage />
    </React.Fragment>
  );
}
