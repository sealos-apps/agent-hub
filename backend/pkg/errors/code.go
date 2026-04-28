package errors

const (
	CodeInvalidJSON                = 40000
	CodeInvalidRequest             = 40001
	CodeInvalidAgentName           = 40002
	CodeInvalidAgentState          = 40003
	CodeMissingAuthorizationHeader = 40010
	CodeInvalidAuthorizationHeader = 40011
	CodeNotFound                   = 40400
	CodeConflict                   = 40900
	CodeValidationFailed           = 42200
	CodeKubernetesOperation        = 50010
	CodeAIProxyOperation           = 50020
	CodeNotImplemented             = 50100
)

type AppError struct {
	InternalCode    int
	InternalMessage string
	ErrorType       string
	ErrorDetails    map[string]any
}

func New(code int, msg string) *AppError {
	return &AppError{
		InternalCode:    code,
		InternalMessage: msg,
		ErrorType:       errorTypeForCode(code),
	}
}

func (e *AppError) WithDetails(details map[string]any) *AppError {
	e.ErrorDetails = details
	return e
}

func (e AppError) Error() string { return e.InternalMessage }
func (e AppError) Code() int     { return e.InternalCode }
func (e AppError) Type() string  { return e.ErrorType }

func (e AppError) Details() map[string]any {
	return e.ErrorDetails
}

func errorTypeForCode(code int) string {
	switch code {
	case CodeInvalidJSON:
		return "invalid_json"
	case CodeInvalidRequest:
		return "invalid_request"
	case CodeInvalidAgentName:
		return "invalid_agent_name"
	case CodeInvalidAgentState:
		return "invalid_agent_state"
	case CodeMissingAuthorizationHeader:
		return "missing_authorization"
	case CodeInvalidAuthorizationHeader:
		return "invalid_authorization"
	case CodeNotFound:
		return "not_found"
	case CodeConflict:
		return "conflict"
	case CodeValidationFailed:
		return "validation_failed"
	case CodeKubernetesOperation:
		return "kubernetes_operation_failed"
	case CodeAIProxyOperation:
		return "aiproxy_operation_failed"
	case CodeNotImplemented:
		return "not_implemented"
	default:
		return "internal_error"
	}
}

var (
	ErrInvalidJSON    = New(CodeInvalidJSON, "invalid json payload")
	ErrNotImplemented = New(CodeNotImplemented, "not implemented")
)
