package handler

import (
	"context"
	"errors"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
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

func TestIsKubernetesUnavailableError(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "deadline exceeded",
			err:  context.DeadlineExceeded,
			want: true,
		},
		{
			name: "tls handshake timeout",
			err:  errors.New(`Get "https://example.test": net/http: TLS handshake timeout`),
			want: true,
		},
		{
			name: "server timeout",
			err:  apierrors.NewServerTimeout(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "get", 1),
			want: true,
		},
		{
			name: "service unavailable",
			err:  apierrors.NewServiceUnavailable("api server unavailable"),
			want: true,
		},
		{
			name: "forbidden",
			err:  apierrors.NewForbidden(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "devboxes", errors.New("forbidden")),
			want: false,
		},
		{
			name: "not found",
			err:  apierrors.NewNotFound(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "devboxes"),
			want: false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := isKubernetesUnavailableError(tc.err); got != tc.want {
				t.Fatalf("isKubernetesUnavailableError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
