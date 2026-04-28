package kube

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

var gvr = schema.GroupVersionResource{
	Group:    "devbox.sealos.io",
	Version:  "v1alpha2",
	Resource: "devboxes",
}

type Repository struct {
	client    dynamic.Interface
	namespace string
}

func NewRepository(client dynamic.Interface, namespace string) *Repository {
	return &Repository{client: client, namespace: namespace}
}

func ResourceGVR() schema.GroupVersionResource {
	return gvr
}

func (r *Repository) List(ctx context.Context, labelSelector string) (*unstructured.UnstructuredList, error) {
	return r.client.Resource(gvr).Namespace(r.namespace).List(ctx, metav1.ListOptions{LabelSelector: labelSelector})
}

func (r *Repository) Get(ctx context.Context, name string) (*unstructured.Unstructured, error) {
	return r.client.Resource(gvr).Namespace(r.namespace).Get(ctx, name, metav1.GetOptions{})
}

func (r *Repository) Create(ctx context.Context, obj *unstructured.Unstructured) (*unstructured.Unstructured, error) {
	return r.client.Resource(gvr).Namespace(r.namespace).Create(ctx, obj, metav1.CreateOptions{})
}

func (r *Repository) Update(ctx context.Context, obj *unstructured.Unstructured) (*unstructured.Unstructured, error) {
	return r.client.Resource(gvr).Namespace(r.namespace).Update(ctx, obj, metav1.UpdateOptions{})
}

func (r *Repository) Delete(ctx context.Context, name string) error {
	return r.client.Resource(gvr).Namespace(r.namespace).Delete(ctx, name, metav1.DeleteOptions{})
}
