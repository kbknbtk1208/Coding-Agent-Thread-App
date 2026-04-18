import React from 'react';
import Head from 'next/head';
import { ReviewPage } from '../features/review/review-page';

export default function MrPage() {
  return (
    <React.Fragment>
      <Head>
        <title>Fey Review Console | MR</title>
      </Head>
      <ReviewPage />
    </React.Fragment>
  );
}
