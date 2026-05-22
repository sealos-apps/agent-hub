package kube

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

type PodPortForwardOptions struct {
	Namespace  string
	PodName    string
	Port       int
	Clientset  kubernetes.Interface
	RESTConfig *rest.Config
}

type PodPortForwardTunnel struct {
	localURL string
	stopChan chan struct{}
	once     sync.Once
}

func (t *PodPortForwardTunnel) LocalURL() string {
	if t == nil {
		return ""
	}
	return t.localURL
}

func (t *PodPortForwardTunnel) Close() {
	if t == nil {
		return
	}
	t.once.Do(func() {
		close(t.stopChan)
	})
}

type limitedBuffer struct {
	limit int
	data  []byte
}

func newLimitedBuffer(limit int) *limitedBuffer {
	return &limitedBuffer{limit: limit}
}

func (b *limitedBuffer) Write(p []byte) (int, error) {
	if b == nil || b.limit <= 0 {
		return len(p), nil
	}
	if len(p) >= b.limit {
		b.data = append(b.data[:0], p[len(p)-b.limit:]...)
		return len(p), nil
	}
	b.data = append(b.data, p...)
	if overflow := len(b.data) - b.limit; overflow > 0 {
		copy(b.data, b.data[overflow:])
		b.data = b.data[:b.limit]
	}
	return len(p), nil
}

func (b *limitedBuffer) String() string {
	if b == nil {
		return ""
	}
	return string(b.data)
}

func StartPodPortForward(ctx context.Context, options PodPortForwardOptions) (*PodPortForwardTunnel, error) {
	if options.Clientset == nil {
		return nil, errors.New("kubernetes clientset is required")
	}
	if options.RESTConfig == nil {
		return nil, errors.New("kubernetes rest config is required")
	}
	namespace := strings.TrimSpace(options.Namespace)
	podName := strings.TrimSpace(options.PodName)
	if namespace == "" || podName == "" {
		return nil, errors.New("pod namespace and name are required")
	}
	if options.Port < 1 || options.Port > 65535 {
		return nil, errors.New("invalid pod port")
	}

	req := options.Clientset.CoreV1().RESTClient().
		Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("portforward").
		VersionedParams(&corev1.PodPortForwardOptions{
			Ports: []int32{int32(options.Port)},
		}, scheme.ParameterCodec)

	transport, upgrader, err := spdy.RoundTripperFor(options.RESTConfig)
	if err != nil {
		return nil, err
	}
	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, req.URL())

	stopChan := make(chan struct{})
	readyChan := make(chan struct{})
	errOut := newLimitedBuffer(8 * 1024)
	forwarder, err := portforward.NewOnAddresses(
		dialer,
		[]string{"127.0.0.1"},
		[]string{fmt.Sprintf(":%d", options.Port)},
		stopChan,
		readyChan,
		io.Discard,
		errOut,
	)
	if err != nil {
		close(stopChan)
		return nil, err
	}

	errChan := make(chan error, 1)
	go func() {
		errChan <- forwarder.ForwardPorts()
	}()

	select {
	case <-ctx.Done():
		close(stopChan)
		return nil, ctx.Err()
	case err := <-errChan:
		close(stopChan)
		if err != nil {
			if message := strings.TrimSpace(errOut.String()); message != "" {
				return nil, fmt.Errorf("%w: %s", err, message)
			}
			return nil, err
		}
		return nil, errors.New("port-forward stopped before ready")
	case <-readyChan:
	}

	ports, err := forwarder.GetPorts()
	if err != nil {
		close(stopChan)
		return nil, err
	}
	if len(ports) == 0 || ports[0].Local == 0 {
		close(stopChan)
		return nil, errors.New("port-forward did not expose a local port")
	}

	return &PodPortForwardTunnel{
		localURL: "http://127.0.0.1:" + strconv.Itoa(int(ports[0].Local)),
		stopChan: stopChan,
	}, nil
}
