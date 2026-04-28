package random

import (
	crand "crypto/rand"
	"math/big"
)

const alphaNum = "abcdefghijklmnopqrstuvwxyz0123456789"

func String(length int) (string, error) {
	out := make([]byte, length)
	max := big.NewInt(int64(len(alphaNum)))
	for i := range out {
		n, err := crand.Int(crand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = alphaNum[n.Int64()]
	}
	return string(out), nil
}
