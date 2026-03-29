import { useCallback, useEffect, useState } from 'react';
import type { NormalizedReviewData, ReviewProvider } from '../../../shared/domain/review';

interface UseReviewDataReturn {
  data: NormalizedReviewData | null;
  loading: boolean;
  error: string | null;
  refetch: (provider: ReviewProvider) => void;
}

export function useReviewData(initialProvider: ReviewProvider): UseReviewDataReturn {
  const [data, setData] = useState<NormalizedReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback((provider: ReviewProvider) => {
    setLoading(true);
    setError(null);

    window.reviewApi
      .getReviewData({ reviewId: 'mock-review-1', provider })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData(initialProvider);
  }, [initialProvider, fetchData]);

  return { data, loading, error, refetch: fetchData };
}
