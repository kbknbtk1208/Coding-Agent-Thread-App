import { useCallback, useRef, useState } from 'react';
import type { NormalizedReviewData, ReviewSourceDraft } from '../../../shared/domain/review';
import { toNormalizedReviewData } from '../../../shared/domain/review';

interface UseReviewDataReturn {
  data: NormalizedReviewData | null;
  loading: boolean;
  error: string | null;
  initialSelectedFileId: string | null;
  loadSource: (source: ReviewSourceDraft) => Promise<boolean>;
}

export function useReviewData(): UseReviewDataReturn {
  const [data, setData] = useState<NormalizedReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSelectedFileId, setInitialSelectedFileId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadSource = useCallback(async (source: ReviewSourceDraft) => {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await window.reviewApi.loadReviewSource({ source });

      if (requestId !== requestIdRef.current) {
        return false;
      }

      setData(toNormalizedReviewData(result.snapshot));
      setInitialSelectedFileId(result.initialSelectedFileId);
      setLoading(false);
      return true;
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) {
        return false;
      }

      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setLoading(false);
      return false;
    }
  }, []);

  return { data, loading, error, initialSelectedFileId, loadSource };
}
