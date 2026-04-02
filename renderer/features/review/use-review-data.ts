import { useCallback, useEffect, useState } from 'react';
import type {
  NormalizedReviewData,
  ReviewProvider,
  ReviewSourceDraft,
} from '../../../shared/domain/review';
import { toNormalizedReviewData } from '../../../shared/domain/review';

interface UseReviewDataReturn {
  data: NormalizedReviewData | null;
  loading: boolean;
  error: string | null;
  initialSelectedFileId: string | null;
  refetch: (source: ReviewSourceDraft | null) => void;
}

function getMissingSourceMessage(provider: ReviewProvider): string {
  return `${provider} の review source が未指定です。/mr?reviewUrl=...&host=... を指定してください。`;
}

export function useReviewData(initialSource: ReviewSourceDraft | null): UseReviewDataReturn {
  const [data, setData] = useState<NormalizedReviewData | null>(null);
  const [loading, setLoading] = useState(Boolean(initialSource));
  const [error, setError] = useState<string | null>(
    initialSource ? null : getMissingSourceMessage('github'),
  );
  const [initialSelectedFileId, setInitialSelectedFileId] = useState<string | null>(null);

  const fetchData = useCallback((source: ReviewSourceDraft | null) => {
    if (!source) {
      setData(null);
      setInitialSelectedFileId(null);
      setLoading(false);
      setError(getMissingSourceMessage('github'));
      return;
    }

    setLoading(true);
    setError(null);

    window.reviewApi
      .loadReviewSource({ source })
      .then((result) => {
        setData(toNormalizedReviewData(result.snapshot));
        setInitialSelectedFileId(result.initialSelectedFileId);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData(initialSource);
  }, [initialSource, fetchData]);

  return { data, loading, error, initialSelectedFileId, refetch: fetchData };
}
