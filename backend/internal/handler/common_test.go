package handler

import (
	"context"
	"errors"
	"testing"
)

func TestIsCanceledRequestError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error",
			err:  nil,
			want: false,
		},
		{
			name: "context canceled",
			err:  context.Canceled,
			want: true,
		},
		{
			name: "context deadline exceeded",
			err:  context.DeadlineExceeded,
			want: true,
		},
		{
			name: "wrapped context canceled",
			err:  errors.New("request failed: context canceled"),
			want: true,
		},
		{
			name: "regular kubernetes error",
			err:  errors.New("forbidden"),
			want: false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := isCanceledRequestError(tc.err)
			if got != tc.want {
				t.Fatalf("isCanceledRequestError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsClientCanceledError(t *testing.T) {
	t.Parallel()

	if !isClientCanceledError(context.Canceled) {
		t.Fatalf("isClientCanceledError(context.Canceled) = false, want true")
	}
	if isClientCanceledError(context.DeadlineExceeded) {
		t.Fatalf("isClientCanceledError(context.DeadlineExceeded) = true, want false")
	}
}

func TestIsDeadlineExceededError(t *testing.T) {
	t.Parallel()

	if !isDeadlineExceededError(context.DeadlineExceeded) {
		t.Fatalf("isDeadlineExceededError(context.DeadlineExceeded) = false, want true")
	}
	if isDeadlineExceededError(context.Canceled) {
		t.Fatalf("isDeadlineExceededError(context.Canceled) = true, want false")
	}
}
