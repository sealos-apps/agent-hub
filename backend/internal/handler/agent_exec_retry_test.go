package handler

import (
	"context"
	"errors"
	"testing"
)

func TestIsRetryableAgentExecError(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		err  error
		want bool
	}{
		"pod not found is retryable": {
			err:  errors.New("agent pod not found"),
			want: true,
		},
		"container not ready is retryable": {
			err:  errors.New("agent pod container is not ready"),
			want: true,
		},
		"spdy upgrade failure is retryable": {
			err:  errors.New("unable to upgrade connection: container not found (\"demo\")"),
			want: true,
		},
		"pod initializing is retryable": {
			err:  errors.New("pod initializing"),
			want: true,
		},
		"validation error is not retryable": {
			err:  errors.New("exec: permission denied"),
			want: false,
		},
		"context deadline is retryable": {
			err:  context.DeadlineExceeded,
			want: true,
		},
		"context canceled is not retryable": {
			err:  context.Canceled,
			want: false,
		},
		"nil is not retryable": {
			err:  nil,
			want: false,
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := isRetryableAgentExecError(tc.err); got != tc.want {
				t.Fatalf("isRetryableAgentExecError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
