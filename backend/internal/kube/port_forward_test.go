package kube

import "testing"

func TestPodPortForwardMappingUsesEphemeralLocalPort(t *testing.T) {
	t.Parallel()

	if got := podPortForwardMapping(3000); got != ":3000" {
		t.Fatalf("podPortForwardMapping(3000) = %q, want :3000", got)
	}
}

func TestLimitedBufferKeepsRecentBytes(t *testing.T) {
	t.Parallel()

	buffer := newLimitedBuffer(10)
	if _, err := buffer.Write([]byte("1234567890")); err != nil {
		t.Fatalf("buffer.Write() error = %v, want nil", err)
	}
	if _, err := buffer.Write([]byte("abcdef")); err != nil {
		t.Fatalf("buffer.Write() error = %v, want nil", err)
	}

	if got := buffer.String(); got != "7890abcdef" {
		t.Fatalf("buffer.String() = %q, want last 10 bytes", got)
	}
}

func TestLimitedBufferHandlesOversizedWrite(t *testing.T) {
	t.Parallel()

	buffer := newLimitedBuffer(5)
	if _, err := buffer.Write([]byte("123456789")); err != nil {
		t.Fatalf("buffer.Write() error = %v, want nil", err)
	}

	if got := buffer.String(); got != "56789" {
		t.Fatalf("buffer.String() = %q, want last 5 bytes", got)
	}
}
